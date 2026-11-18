/**
 * WarehouseActions — 仓库工作推进与仓库会话.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var IE = window.InventoryEquipment;
    var hideoutWarehousePanelOpen, baseWarehousePanelOpen;

    function tickHideoutWarehouseAfterWorldTick() {
        var HW = window.HideoutWarehouse;
        if (!HW) return;

        var spoilChanged = false;
        if (typeof HW.tickSpoilage === 'function') {
            try {
                var spoilResult = HW.tickSpoilage();
                spoilChanged = !!(spoilResult && (spoilResult.warehouse_spoiled > 0
                    || spoilResult.inventory_spoiled > 0));
                if (spoilResult && spoilResult.expired_items) {
                    Object.keys(spoilResult.expired_items).forEach(function (itemId) {
                        var tpl = IE && typeof IE.getItemTemplate === 'function' ? IE.getItemTemplate(itemId) : null;
                        var itemName = tpl ? (tpl.sn || tpl.name || itemId) : itemId;
                        window.SceneFeedback.showMsg(window.SceneFeedback.ui('pharmacy.spoilage.expired', { item: itemName, n: spoilResult.expired_items[itemId] }), 'warn');
                    });
                }
            } catch (eSpoil) { /* ignore */ }
        }

        if (spoilChanged
            || (window.HideoutWarehousePanel && typeof window.HideoutWarehousePanel.isOpen === 'function'
                && window.HideoutWarehousePanel.isOpen())) {
            if (window.HideoutWarehousePanel && typeof window.HideoutWarehousePanel.render === 'function') {
                try { window.HideoutWarehousePanel.render(); } catch (eHwUi) { /* ignore */ }
            }
        }
        if (window.SceneHud && typeof window.SceneHud.refresh === 'function') {
            try { window.SceneHud.refresh('status'); } catch (eSt) { /* ignore */ }
        }
    }

    function isHideoutWarehouseConstructionLive() {
        return !!(window.HideoutWarehousePanel
            && typeof window.HideoutWarehousePanel.isConstructionLive === 'function'
            && window.HideoutWarehousePanel.isConstructionLive());
    }

    function openHideoutWarehousePanel() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (window.SceneAccess.guardPlayerComaBlocked()) return;
        if (hideoutWarehousePanelOpen) return;
        hideoutWarehousePanelOpen = true;
        if (window.BackpackPanel && !window.BackpackPanel.attachInteraction({
            id:'warehouse',node:document.getElementById('modal-hideout-warehouse'),
            close:function(){closeHideoutWarehousePanel();return !hideoutWarehousePanelOpen;}
        })) {hideoutWarehousePanelOpen=false;return;}
        if (window.HideoutWarehousePanel && typeof window.HideoutWarehousePanel.bindOnce === 'function') {
            window.HideoutWarehousePanel.bindOnce();
        }
        if (window.HideoutWarehousePanel && typeof window.HideoutWarehousePanel.open === 'function') {
            window.HideoutWarehousePanel.open();
        } else {
            var modal = document.getElementById('modal-hideout-warehouse');
            if (modal) {
                modal.classList.add('show');
                modal.setAttribute('aria-hidden', 'false');
            }
        }
        window.SceneMapView.render();
    }

    function closeHideoutWarehousePanel() {
        if (!hideoutWarehousePanelOpen) return;
        if (window.HideoutWarehousePanel && typeof window.HideoutWarehousePanel.close === 'function') {
            var closeResult = window.HideoutWarehousePanel.close();
            if (closeResult && closeResult.ok === false) return;
        } else {
            var modal = document.getElementById('modal-hideout-warehouse');
            if (modal) {
                modal.classList.remove('show');
                modal.setAttribute('aria-hidden', 'true');
            }
        }
        hideoutWarehousePanelOpen = false;
        window.BackpackPanel && window.BackpackPanel.endInteraction("warehouse");
        window.SceneMapView.render();
    }

    function buildBaseWarehouseList(filterStr) {
        if (window.SveltePanels) { window.SveltePanels.refresh('warehouse', filterStr); return; }
        var el = document.getElementById('base-warehouse-list');
        if (!el) return;
        var IE = window.InventoryEquipment;
        if (!IE || typeof IE.getAllItemIds !== 'function') {
            el.textContent = '';
            return;
        }
        var ids = IE.getAllItemIds();
        var f = (filterStr || '').trim().toLowerCase();
        var char0 = IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        var frag = document.createDocumentFragment();
        var i;
        for (i = 0; i < ids.length; i++) {
            var id = ids[i];
            var tpl = IE.getItemTemplate(id);
            var tier = IE.getItemDisplayTier ? IE.getItemDisplayTier(id, char0) : 0;
            var disp = tpl && IE.getDisplayName ? IE.getDisplayName(tpl, tier, char0) : '';
            if (!disp && tpl) {
                disp = tpl.sn || tpl.placeholder_name || window.SceneFeedback.ui('hideout_warehouse.item.unknown');
            }
            if (!disp) disp = window.SceneFeedback.ui('hideout_warehouse.item.unknown');
            if (!IE.matchesDebugItemSearch(id, f, disp)) continue;
            var row = document.createElement('div');
            row.className = 'warehouse-item-row';
            var nameEl = document.createElement('div');
            nameEl.className = 'wname';
            nameEl.textContent = disp;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-take-one';
            btn.setAttribute('data-item-id', id);
            btn.textContent = window.SceneFeedback.ui('warehouse.take.one');
            if (tpl) {
                var tipHtml = SceneUi.buildItemTooltipHtmlForTemplate(id, tpl, null, char0);
                row.addEventListener('mouseenter', function (h, elRef) { return function () { SceneUi.showItemTooltip(h, elRef); }; }(tipHtml, row));
                row.addEventListener('mouseleave', SceneUi.hideItemTooltip);
            }
            row.appendChild(nameEl);
            row.appendChild(btn);
            frag.appendChild(row);
        }
        el.innerHTML = '';
        el.appendChild(frag);
    }

    function takeFromBaseWarehouse(itemId) {
        var IE = window.InventoryEquipment;
        if (!IE || !itemId) return;
        var tpl = IE.getItemTemplate(itemId);
        if (!tpl) return;
        var r = IE.putItemIntoDefaultContainer({ item_id: itemId, count: 1 });
        var char0 = IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        var tier0 = IE.getItemDisplayTier ? IE.getItemDisplayTier(itemId, char0) : 0;
        var dispName = tpl && IE.getDisplayName ? IE.getDisplayName(tpl, tier0, char0) : '';
        if (!dispName && tpl) dispName = tpl.sn || tpl.placeholder_name || window.SceneFeedback.ui('hideout_warehouse.item.unknown');
        if (!dispName) dispName = window.SceneFeedback.ui('hideout_warehouse.item.unknown');
        if (r.placed) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('warehouse.take.ok', { name: dispName }), 'success');
        } else {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('warehouse.take.fail'), 'warn');
        }
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick({ source: 'inventory_transfer' });
        if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
        window.SceneMapView.render();
    }

    function openBaseWarehousePanel() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (!StationContext.isAdjacentToWarehouseTile()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('scene.msg.warehouse_stand_nearby'), 'info');
            return;
        }
        if (baseWarehousePanelOpen) return;
        baseWarehousePanelOpen = true;
        if (window.SveltePanels) window.SveltePanels.refresh('warehouse');
        var modal = document.getElementById('modal-base-warehouse');
        if (modal && !window.SveltePanels) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        var filterEl = document.getElementById('base-warehouse-filter');
        if (filterEl && !window.SveltePanels) filterEl.value = '';
        buildBaseWarehouseList('');
        if (!window.SveltePanels && window.UIText && typeof window.UIText.applyDom === 'function') {
            var mw = document.getElementById('modal-base-warehouse');
            if (mw) window.UIText.applyDom(mw);
        }
        window.SceneMapView.render();
    }

    function closeBaseWarehousePanel() {
        if (!baseWarehousePanelOpen) return;
        baseWarehousePanelOpen = false;
        if (window.SveltePanels) window.SveltePanels.refresh('warehouse');
        var modal = document.getElementById('modal-base-warehouse');
        if (modal && !window.SveltePanels) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        window.SceneMapView.render();
    }

    function initialize() {
        hideoutWarehousePanelOpen = false;
        baseWarehousePanelOpen = false;
    }

    function bind() {

    (function bindHideoutWarehousePanelOnce() {
        if (window.HideoutWarehousePanel && typeof window.HideoutWarehousePanel.bindOnce === 'function') {
            window.HideoutWarehousePanel.bindOnce();
        }
    })();

    (function bindBaseWarehouse() {
        var abw = !window.SvelteInteractions && document.getElementById('action-bar-warehouse');
        if (abw) {
            abw.addEventListener('click', function () {
                if (baseWarehousePanelOpen) closeBaseWarehousePanel(); else openBaseWarehousePanel();
            });
        }
        var cl = document.getElementById('base-warehouse-close');
        if (cl) cl.addEventListener('click', closeBaseWarehousePanel);
        var listEl = document.getElementById('base-warehouse-list');
        if (listEl) {
            listEl.addEventListener('click', function (ev) {
                var t = ev.target;
                if (!t || !t.closest) return;
                var btn = t.closest('.btn-take-one');
                if (!btn) return;
                var iid = btn.getAttribute('data-item-id');
                if (iid) takeFromBaseWarehouse(iid);
            });
        }
        var fe = document.getElementById('base-warehouse-filter');
        if (fe) {
            fe.addEventListener('input', function () {
                if (!baseWarehousePanelOpen) return;
                buildBaseWarehouseList(fe.value || '');
                if (window.UIText && typeof window.UIText.applyDom === 'function') {
                    var mw = document.getElementById('modal-base-warehouse');
                    if (mw) window.UIText.applyDom(mw);
                }
            });
        }
    })();
    }

    window.WarehouseActions = {
        initialize: initialize,
        bind: bind,
        get baseWarehousePanelOpen() { return baseWarehousePanelOpen; },
        closeBaseWarehousePanel: closeBaseWarehousePanel,
        closeHideoutWarehousePanel: closeHideoutWarehousePanel,
        isHideoutWarehouseConstructionLive: isHideoutWarehouseConstructionLive,
        openBaseWarehousePanel: openBaseWarehousePanel,
        openHideoutWarehousePanel: openHideoutWarehousePanel,
        takeFromBaseWarehouse: takeFromBaseWarehouse,
        tickHideoutWarehouseAfterWorldTick: tickHideoutWarehouseAfterWorldTick
    };
})(window);
