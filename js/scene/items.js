/**
 * ItemUseActions — 完整物品使用/装备动作与事务.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;

    /** 物品使用失败原因 → 提示文案键（47 §5.2 途径前置条件）。 */
    function useFailureMessageKey(reason) {
        switch (String(reason || '')) {
            case 'needs_part': return 'item.use.fail.needs_part';
            case 'bad_part': return 'item.use.fail.bad_part';
            case 'needs_inject_kit': return 'item.use.fail.needs_inject_kit';
            case 'in_combat': return 'item.use.fail.in_combat';
            case 'must_be_still': return 'item.use.fail.must_be_still';
            case 'already_active': return 'item.use.fail.already_active';
            case 'route_not_allowed': return 'item.use.fail.route_not_allowed';
            case 'no_effect': return 'item.use.fail.no_effect';
            case 'buff_apply_failed': return 'item.use.fail.buff_apply_failed';
            default: return 'item.use.cannot';
        }
    }

    function tryUseItemFromContainer(containerType, index, opts) {
        var inv = window.InventoryEquipment, options = opts || {};
        var arr = inv && (containerType === 'pocket' ? inv.getPocketArray() :
            containerType === 'vest' ? inv.getVestArray() : containerType === 'backpack' ? inv.getBackpackArray() : []);
        var cell = arr && arr[index], tpl = cell && inv.getItemTemplate(cell.item_id);
        if (!ItemUse.isFoodTemplate(tpl)) return performItemUseFromContainer(containerType, index, options);
        if (window.SceneAccess.isPreCreationGameplayRestricted() || window.SceneAccess.guardPlayerComaBlocked() ||
            (window.Survival && (window.Survival.isDead() || window.Survival.isComa())) || window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.ITEM_USE, { level: 'warn' })) return false;
        // Consumption, digestion, muscle growth and the existing use tick commit together.
        var failed = {}, successMessage = '';
        try {
            if (!window.SaveSystem || !window.SaveSystem.runAtomicFor) throw Error('保存服务尚未就绪。');
            var result = window.SaveSystem.runAtomicFor('inventory.transfer', function () {
                var useOptions = Object.assign({}, options, { onSuccess: function (text) { successMessage = text; } });
                if (!performItemUseFromContainer(containerType, index, useOptions)) throw failed;
                return true;
            });
            if (!result.saved) throw Error('保存失败，食物、成长和时间已恢复。');
            if (!options.silent) window.SceneFeedback.showMsg(successMessage, 'success');
            return true;
        } catch (error) {
            if (error !== failed && !options.silent) window.SceneFeedback.showMsg(error.message, 'warn');
            SceneHud.refresh('status');
            if (window.InventoryPanel.backpackPanelOpen) window.InventoryPanel.updateBackpackPanel();
            return false;
        }
    }

    function performItemUseFromContainer(containerType, index, opts) {
        var inv = window.InventoryEquipment;
        if (!inv || typeof inv.takeItemFromContainer !== 'function') return false;
        var options = opts || {};
        if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.ITEM_USE, { level: 'warn' })) return false;
        var arr = containerType === 'pocket' ? (inv.getPocketArray ? inv.getPocketArray() : [])
            : (containerType === 'vest' ? (inv.getVestArray ? inv.getVestArray() : [])
                : (containerType === 'backpack' ? (inv.getBackpackArray ? inv.getBackpackArray() : [])
                    : []));
        var cell = arr[index];
        if (!cell || !cell.item_id) return false;
        var itemId = cell.item_id;
        var tpl = inv.getItemTemplate(itemId);
        if (!ItemUse.itemTemplateIsConsumable(tpl)) {
            if (!options.silent) window.SceneFeedback.showMsg(window.SceneFeedback.ui('item.use.cannot'), 'info');
            return false;
        }
        if (!options.silent && window.BuffSystem && typeof window.BuffSystem.getPharmacyDoseUseWarning === 'function' && tpl.use_buff_id) {
            var doseWarning = window.BuffSystem.getPharmacyDoseUseWarning(tpl.use_buff_id, 'item:' + itemId);
            if (doseWarning.refresh) window.SceneFeedback.showMsg(window.SceneFeedback.ui('item.use.warn.refresh'), 'info');
            else if (doseWarning.stronger_active) window.SceneFeedback.showMsg(window.SceneFeedback.ui('item.use.warn.stronger_active'), 'info');
        }
        if (!options.silent && tpl.pharmacy_compound === true && window.PharmacyCompounding && typeof window.PharmacyCompounding.resolveInstance === 'function') {
            var doseResolved = window.PharmacyCompounding.resolveInstance(cell);
            var formulaSource = 'pharmacy:compound:' + String(cell.pharmacy_formula_key || (typeof window.PharmacyCompounding.compoundIdentityKey === 'function' ? window.PharmacyCompounding.compoundIdentityKey(cell.components || []) : ''));
            var dynamicRefresh = false, dynamicStronger = false;
            if (doseResolved && doseResolved.ok && window.BuffSystem && typeof window.BuffSystem.getPharmacyDoseUseWarning === 'function') {
                (doseResolved.buff_ids || []).forEach(function (bid) {
                    var w = window.BuffSystem.getPharmacyDoseUseWarning(bid, formulaSource);
                    dynamicRefresh = dynamicRefresh || w.refresh;
                    dynamicStronger = dynamicStronger || w.stronger_active;
                });
            }
            if (dynamicRefresh) window.SceneFeedback.showMsg(window.SceneFeedback.ui('item.use.warn.refresh'), 'info');
            else if (dynamicStronger) window.SceneFeedback.showMsg(window.SceneFeedback.ui('item.use.warn.stronger_active'), 'info');
        }
        var taken = inv.takeItemFromContainer(containerType, index);
        if (!taken.success || !taken.item) {
            if (!options.silent) window.SceneFeedback.showMsg(window.SceneFeedback.ui('item.use.fail'), 'warn');
            return false;
        }
        // 47 §5.2 途径门禁：外敷/注射战斗中不可、注射需静止（取物前拦截，物品原样退回）
        var gate = window.SceneAccess.checkUseRouteGate(tpl);
        if (gate) {
            if (inv.putItemIntoDefaultContainer) inv.putItemIntoDefaultContainer(taken.item);
            if (!options.silent) window.SceneFeedback.showMsg(window.SceneFeedback.ui(useFailureMessageKey(gate.reason)), 'info');
            return false;
        }
        // 47 §8：一盒多次用量（药膏/散按次）——模板 use_charges>0 时按次数消耗，用尽才消失
        var chargesMax = parseInt(tpl && tpl.use_charges, 10) || 0;
        var curCharges = 0;
        if (chargesMax > 0) {
            curCharges = (taken.item && taken.item.charges != null) ? Math.max(0, parseInt(taken.item.charges, 10) || 0) : chargesMax;
            if (curCharges <= 0) curCharges = chargesMax;
        }
        if (!ItemUse.applyItemUseEffectFromTemplate(itemId, tpl, { part_id: options.part_id, instance: taken.item, silent: options.silent })) {
            if (inv.putItemIntoDefaultContainer) inv.putItemIntoDefaultContainer(taken.item);
            if (!options.silent) {
                var failInfo = (typeof ItemUse.takeLastUseFailure === 'function') ? ItemUse.takeLastUseFailure() : null;
                window.SceneFeedback.showMsg(window.SceneFeedback.ui(useFailureMessageKey(failInfo && failInfo.reason)), 'info');
            }
            return false;
        }
        var chargesLeft = 0;
        if (chargesMax > 0) {
            chargesLeft = curCharges - 1;
            if (chargesLeft > 0 && inv.putItemIntoDefaultContainer) {
                inv.putItemIntoDefaultContainer({ item_id: itemId, count: 1, charges: chargesLeft });
            }
        }
        var char0 = inv.getCharacterForDisplay ? inv.getCharacterForDisplay() : null;
        var tier0 = inv.getItemDisplayTier ? inv.getItemDisplayTier(itemId, char0) : 0;
        var dispName = inv.getDisplayName ? inv.getDisplayName(tpl, tier0, char0) : itemId;
        var useOkMsg = window.SceneFeedback.ui('item.use.ok', { name: dispName });
        if (chargesMax > 0 && chargesLeft > 0) useOkMsg += ' ' + window.SceneFeedback.ui('item.use.charges_left', { n: String(chargesLeft) });
        var expText = window.ItemUse.takeLastFoodExpGrantText();
        if (expText) useOkMsg += ' ' + expText;
        if (options.onSuccess) options.onSuccess(useOkMsg);
        else if (!options.silent) window.SceneFeedback.showMsg(useOkMsg, 'success');
        // 47 §5.2：使用耗时按途径区分（口服/外敷 1 · 吸入 2 · 刺入 3；注射还需静止）
        var useTicks = (typeof ItemUse.getUseTickCost === 'function') ? ItemUse.getUseTickCost(tpl) : 1;
        if (useTicks > 1) window.WorldTick.advanceWorldTicks(useTicks);
        else if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (typeof window.InventoryPanel.backpackPanelOpen !== 'undefined' && window.InventoryPanel.backpackPanelOpen && typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
        if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
        return true;
    }

    function tryEquipItemFromContainer(containerType, index, opts) {
        var inv = window.InventoryEquipment;
        if (!inv || typeof inv.takeItemFromContainer !== 'function' || typeof inv.equip !== 'function') return false;
        var options = opts || {};
        var arr = containerType === 'pocket' ? (inv.getPocketArray ? inv.getPocketArray() : [])
            : (containerType === 'vest' ? (inv.getVestArray ? inv.getVestArray() : [])
                : (containerType === 'backpack' ? (inv.getBackpackArray ? inv.getBackpackArray() : [])
                    : []));
        var cell = arr[index];
        if (!cell || !cell.item_id) return false;
        var tpl = inv.getItemTemplate(cell.item_id);
        if (!tpl || !tpl.equip_slot) return false;
        if (tpl.equip_slot === 'backpack' && window.BackpackSystem) {
            var moved = window.BackpackSystem.transfer({action:'equip',source:containerType,index:index,id:cell.instance_id});
            if (!options.silent) window.SceneFeedback.showMsg(moved.message,moved.ok?'success':'warn');
            if (window.InventoryPanel.backpackPanelOpen) window.InventoryPanel.updateBackpackPanel();window.SceneMapView.render();return moved.ok;
        }
        var slotId = tpl.equip_slot;
        if (window.ModularWeaponCombat && window.ModularWeaponCombat.isWeapon(cell)) {
            slotId = options.slot || slotId;
            var check = window.ModularWeaponCombat.validateEquip(cell, slotId);
            if (!check.success) { if (!options.silent) window.SceneFeedback.showMsg(check.message, 'warn'); return false; }
        }
        var posNow = E && E.getState ? E.getState() : null;

        var taken = inv.takeItemFromContainer(containerType, index);
        if (!taken.success || !taken.item) return false;
        var itemToEquip = taken.item;
        if (itemToEquip && itemToEquip.count != null) itemToEquip.count = 1;

        var stNow = inv.getState ? inv.getState() : {};
        var currentEq = (stNow && stNow.equipment) ? stNow.equipment[slotId] : null;
        if (currentEq && typeof inv.unequip === 'function') {
            var unequipped = inv.unequip(slotId, posNow);
            if (unequipped) {
                var placedOld = inv.putItemIntoDefaultContainer ? inv.putItemIntoDefaultContainer(unequipped) : null;
                if ((!placedOld || !placedOld.placed) && posNow && posNow.mapId != null && posNow.x != null && posNow.y != null && typeof inv.addItemToGround === 'function') {
                    inv.addItemToGround(posNow.mapId, posNow.x, posNow.y, unequipped);
                }
            }
        }

        var res = inv.equip(slotId, itemToEquip);
        if (!res || !res.success) {
            var placedNew = inv.putItemIntoDefaultContainer ? inv.putItemIntoDefaultContainer(itemToEquip) : null;
            if ((!placedNew || !placedNew.placed) && posNow && posNow.mapId != null && posNow.x != null && posNow.y != null && typeof inv.addItemToGround === 'function') {
                inv.addItemToGround(posNow.mapId, posNow.x, posNow.y, itemToEquip);
            }
            if (!options.silent) {
                if (res && res.message) window.SceneFeedback.showMsg(res.message, 'warn');
                else window.SceneFeedback.showMsg(window.SceneFeedback.ui('inv.equip'), 'warn');
            }
            return false;
        }

        if (!options.silent) window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.success.equipped'), 'success');
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (typeof window.InventoryPanel.backpackPanelOpen !== 'undefined' && window.InventoryPanel.backpackPanelOpen && typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
        if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
        return true;
    }

    function tryUseQuickBeltDigit(digit) {
        var inv = window.InventoryEquipment;
        if (!inv || typeof inv.getQuickBeltSlotSource !== 'function') return;
        if (digit < 1 || digit > 9) return;
        var beltIndex = digit - 1;
        var total = typeof inv.getQuickBeltSlots === 'function' ? inv.getQuickBeltSlots() : 0;
        if (beltIndex < 0 || beltIndex >= total) return;
        var src = inv.getQuickBeltSlotSource(beltIndex);
        if (!src || !src.type) return;
        tryUseItemFromContainer(src.type, src.index);
    }

    function tryDrinkWaterFlask(instanceId) {
        if (!window.WaterFlaskUse) return;
        var result = window.WaterFlaskUse.drink(instanceId);
        window.SceneFeedback.showMsg(result.message, result.ok ? 'success' : 'warn');
        window.InventoryPanel.updateBackpackPanel();
        window.PlayerActions.refreshPlayerActionsMenuUi();
        window.SceneMapView.render();
        return result;
    }

    function initialize() {

    }

    function bind() {

    }

    window.ItemUseActions = {
        initialize: initialize,
        bind: bind,
        tryDrinkWaterFlask: tryDrinkWaterFlask,
        tryEquipItemFromContainer: tryEquipItemFromContainer,
        tryUseItemFromContainer: tryUseItemFromContainer,
        tryUseQuickBeltDigit: tryUseQuickBeltDigit
    };
})(window);
