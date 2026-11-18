/**
 * StationActions — 制作启动、站点资源与制作计时.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;
    var G = window.Gathering;
    var IE = window.InventoryEquipment;
    var COOKING_FUEL_MAX_POINTS, COOKING_WATER_MAX_POINTS, COOKING_BASE_STATION_UNLOCK_FLAG, cookingCraftIdleTimer, pharmacyCraftIdleTimer, COOKING_DEFAULT_PROCESSOR_ID, cookingRecipeProcessorRegistered, PHARMACY_DEFAULT_PROCESSOR_ID, PHARMACY_BASE_STATION_UNLOCK_FLAG, PHARMACY_WATER_MAX_POINTS, DEFAULT_PHARMACY_INSTALLED_ACCESSORIES, pharmacyRecipeProcessorRegistered, DEFAULT_COOKING_INSTALLED_ACCESSORIES;

    function resolveCookingSlotOrFirst(forcedSlot, predicateFn) {
        if (forcedSlot && forcedSlot.containerType != null && forcedSlot.index != null) {
            var arrF = InventoryHelpers.getInventoryContainerArray(forcedSlot.containerType);
            var ix = Math.floor(Number(forcedSlot.index));
            if (!Array.isArray(arrF) || !(ix >= 0) || ix >= arrF.length) return null;
            var cellF = arrF[ix];
            if (!cellF || !cellF.item_id) return null;
            if (typeof predicateFn === 'function' && !predicateFn(cellF)) return null;
            return { containerType: String(forcedSlot.containerType), index: ix, item: cellF };
        }
        return InventoryHelpers.findFirstContainerSlotByPredicate(predicateFn);
    }

    function registerCookingRecipeProcessorIfNeeded() {
        if (cookingRecipeProcessorRegistered) return;
        if (!window.RecipeSystem || typeof window.RecipeSystem.registerProcessor !== 'function') return;
        window.RecipeSystem.registerProcessor(COOKING_DEFAULT_PROCESSOR_ID, function (payload) {
            var recipe = payload && payload.recipe && typeof payload.recipe === 'object' ? payload.recipe : {};
            var route = payload && payload.route && typeof payload.route === 'object' ? payload.route : {};
            var method = payload && payload.method && typeof payload.method === 'object' ? payload.method : {};
            var mainOut = recipe && recipe.main_output && typeof recipe.main_output === 'object' ? recipe.main_output : null;
            var bonusOut = Array.isArray(recipe && recipe.bonus_outputs) ? recipe.bonus_outputs : [];
            var failOut = route && route.failure_output && typeof route.failure_output === 'object' ? route.failure_output : null;
            return {
                selected_recipe_id: payload && payload.recipe_id ? String(payload.recipe_id) : '',
                method_id: method && method.method_id != null ? String(method.method_id) : '',
                route: route,
                main_output: mainOut,
                bonus_outputs: bonusOut,
                failure_output: failOut,
                recommended_skill_level: route && route.recommended_skill_level != null ? route.recommended_skill_level : 0,
                cost_override: route && route.cost_override && typeof route.cost_override === 'object' ? route.cost_override : null,
                base_success_rate: (route && route.base_success_rate != null)
                    ? route.base_success_rate
                    : (method && method.base_success_rate != null ? method.base_success_rate : null)
            };
        });
        cookingRecipeProcessorRegistered = true;
    }

    function registerPharmacyRecipeProcessorIfNeeded() {
        if (pharmacyRecipeProcessorRegistered) return;
        if (!window.RecipeSystem || typeof window.RecipeSystem.registerProcessor !== 'function') return;
        window.RecipeSystem.registerProcessor(PHARMACY_DEFAULT_PROCESSOR_ID, function (payload) {
            var recipe = payload && payload.recipe && typeof payload.recipe === 'object' ? payload.recipe : {};
            var route = payload && payload.route && typeof payload.route === 'object' ? payload.route : {};
            var method = payload && payload.method && typeof payload.method === 'object' ? payload.method : {};
            var mainOut = recipe && recipe.main_output && typeof recipe.main_output === 'object' ? recipe.main_output : null;
            var bonusOut = Array.isArray(recipe && recipe.bonus_outputs) ? recipe.bonus_outputs : [];
            var failOut = route && route.failure_output && typeof route.failure_output === 'object' ? route.failure_output : null;
            return {
                selected_recipe_id: payload && payload.recipe_id ? String(payload.recipe_id) : '',
                method_id: method && method.method_id != null ? String(method.method_id) : '',
                route: route,
                main_output: mainOut,
                bonus_outputs: bonusOut,
                failure_output: failOut,
                recommended_skill_level: route && route.recommended_skill_level != null ? route.recommended_skill_level : 0,
                cost_override: route && route.cost_override && typeof route.cost_override === 'object' ? route.cost_override : null,
                base_success_rate: (route && route.base_success_rate != null)
                    ? route.base_success_rate
                    : (method && method.base_success_rate != null ? method.base_success_rate : null)
            };
        });
        pharmacyRecipeProcessorRegistered = true;
    }

    function stopCookingCraftIdle() {
        if (cookingCraftIdleTimer) {
            try { clearInterval(cookingCraftIdleTimer); } catch (e0) { /* ignore */ }
            cookingCraftIdleTimer = null;
        }
    }

    function startCookingCraftIdleIfNeeded() {
        if (cookingCraftIdleTimer) return;
        if (!CookingStation.getActiveCraft()) return;
        stopPharmacyCraftIdle();
        cookingCraftIdleTimer = setInterval(function () {
            var craft = CookingStation.getActiveCraft();
            if (!craft || !StationContext.getCurrentCookingStationContext()) {stopCookingCraftIdle();return;}
            window.Survival.advanceTick({source:'cooking_work', intensity:craft.intensity, actionCost:craft.intensity ? undefined : 0});
        }, window.PlayerActions.getIdleTickMs());
    }

    // === Auto-generated Pharmacy Helper ===
    function startPharmacyCraftIdleIfNeeded() {
        if (pharmacyCraftIdleTimer) return;
        if (!PharmacyStation.getActiveCraft()) return;
        stopCookingCraftIdle();
        pharmacyCraftIdleTimer = setInterval(function () {
            var craft = PharmacyStation.getActiveCraft();
            if (!craft || !StationContext.getCurrentPharmacyStationContext()) {stopPharmacyCraftIdle();return;}
            window.Survival.advanceTick({source:'pharmacy_work', intensity:craft.intensity, actionCost:craft.intensity ? undefined : 0});
        }, 1000);
    }

    function stopPharmacyCraftIdle() {
        if (pharmacyCraftIdleTimer) {
            try { clearInterval(pharmacyCraftIdleTimer); } catch (e0) { /* ignore */ }
            pharmacyCraftIdleTimer = null;
        }
    }

    function tickPharmacyTempStationsAfterWorldTick() {
        // 制药台暂未启用临时工位；保留空函数避免 tick patch 调用缺失。
    }

    function tryPharmacyAtStation(methodId, inputItems) {
        if(methodId==='life_pharmacy.medical_alcohol'&&!window.SaveSystem.isAtomic()){
            var transaction=window.SaveSystem.runAtomicFor('craft.pharmacy',function(){return tryPharmacyAtStation(methodId,inputItems);});
            if(!transaction.saved){stopPharmacyCraftIdle();return {ok:false,reason:'save_failed'};}
            return transaction.value;
        }
        if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.CRAFT)) {
            return { ok: false, reason: 'action_disabled', action_type: window.SceneAccess.ACTION_TYPES.CRAFT };
        }
        var stationCtx = StationContext.getCurrentPharmacyStationContext();
        if (!stationCtx) return { ok: false, reason: 'not_on_pharmacy_station' };
        if (StationContext.isPharmacyUiBlockedByRepairForContext(stationCtx)) {
            return { ok: false, reason: 'pharmacy_station_repair_locked' };
        }
        if (methodId == null || !Array.isArray(inputItems)) return { ok: false, reason: 'bad_args' };
        if (PharmacyStation.getActiveCraft()) return { ok: false, reason: 'craft_in_progress' };
        var mid = String(methodId).trim();
        if (!mid) return { ok: false, reason: 'method_required' };
        var m = PharmacyStation.getMethods() && PharmacyStation.getMethods()[mid] ? PharmacyStation.getMethods()[mid] : null;
        if (!m) return { ok: false, reason: 'method_not_found', method_id: mid };
        if (!PharmacyStation.isPharmacyMethodUnlockedAtStation(mid, stationCtx)) {
            return {
                ok: false,
                reason: 'pharmacy_method_locked',
                method_id: mid,
                required_accessory_item_id: m.requires_accessory_item_id != null ? m.requires_accessory_item_id : null
            };
        }

        var selected = StationCraftCore.normalizePharmacyInputs(inputItems);
        if (!selected.length) return { ok: false, reason: 'empty_inputs' };
        var i;
        for (i = 0; i < selected.length; i++) {
            var sid = selected[i].item_id;
            if (!StationCraftCore.isItemAllowedPharmacyIngredient(sid)) {
                return { ok: false, reason: 'not_pharmacy_ingredient', item_id: sid };
            }
            if (InventoryHelpers.getInventoryCountByItemId(sid) < selected[i].count) {
                return { ok: false, reason: 'missing_input_items', item_id: sid };
            }
        }

        var routePreview = PharmacyStation.tryResolvePharmacyByUnifiedRoute(mid, selected);
        var previewData = routePreview && routePreview.ok ? routePreview.data : null;
        var costSource = previewData && previewData.cost_override ? { cost: previewData.cost_override } : m;
        var needTicks = StationCraftCore.readMethodCostValue(costSource, 'ticks', 'craft_ticks');
        var needStamina = StationCraftCore.methodStamina(mid, needTicks);
        var survState = window.Survival && typeof window.Survival.getState === 'function' ? window.Survival.getState() : null;
        var curStamina = survState ? Number(survState.stamina || 0) : 0;
        if (curStamina < (window.Survival.getActionStaminaCost ? window.Survival.getActionStaminaCost(needStamina) : needStamina)) return { ok: false, reason: 'insufficient_stamina', need: needStamina, current: curStamina };
        if (IE && typeof IE.canAcceptItem === 'function' && !IE.canAcceptItem()) {
            return { ok: false, reason: 'inventory_full' };
        }

        var consumedRes = StationCraftCore.consumeInventoryItemsByList(selected);
        if (!consumedRes.ok) {
            StationCraftCore.putItemsBack(consumedRes.consumed || []);
            return { ok: false, reason: 'consume_inputs_failed' };
        }


        var cs2 = PharmacyStation.getState();
        var gt = window.GameTime && typeof window.GameTime.getState === 'function' ? window.GameTime.getState() : null;
        cs2.active_craft = {
            remaining_ticks: Math.max(1, needTicks),
            intensity: StationCraftCore.methodIntensity(mid),
            started_total_ticks: gt && typeof gt.totalTicks === 'number' ? gt.totalTicks : 0,
            method_id: mid,
            inputs: selected,
            consumed_items: consumedRes.consumed || [],
            equipment_wear: PharmacyStation.prepareEquipmentWear(mid),
            medical_success: mid==='life_pharmacy.medical_alcohol'?Math.random()<PharmacyStation.getCraftPreview(mid,selected).success_rate:null,
            recommended_skill_level: previewData ? Math.max(0, parseInt(previewData.recommended_skill_level, 10) || 0) : 0,
            station_ref: {
                station_type: stationCtx.station_type || 'main',
                map_id: stationCtx.map_id,
                x: stationCtx.x,
                y: stationCtx.y
            }
        };
        PharmacyStation.clearLastCraftResult();
        window.PlayerActions.stopGatheringIdle();
        window.WorldTick.patchSurvivalTickForPharmacyCraftOnce();
        startPharmacyCraftIdleIfNeeded();
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('pharmacy.msg.started', { n: Math.max(1, needTicks) }), 'info');
        if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (window.SceneRenderer) window.SceneRenderer.render();
        return {
            ok: true,
            started: true,
            method_id: mid,
            remaining_ticks: Math.max(1, needTicks),
            consumed: { fuel: 0, ticks: needTicks, stamina: 0 }
        };
    }

    /** 制药台配药模式：无效输入不开工；配伍失败消耗后产药渣；合法组合产动态注射液。 */
    function tryCompoundAtStation(inputItems) {
        if (!window.PharmacyCompounding || !window.PharmacyCompounding.isUnlocked()) {
            return { ok: false, reason: 'injection_locked' };
        }
        if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.CRAFT)) {
            return { ok: false, reason: 'action_disabled', action_type: window.SceneAccess.ACTION_TYPES.CRAFT };
        }
        var stationCtx = StationContext.getCurrentPharmacyStationContext();
        if (!stationCtx) return { ok: false, reason: 'not_on_pharmacy_station' };
        if (StationContext.isPharmacyUiBlockedByRepairForContext(stationCtx)) {
            return { ok: false, reason: 'pharmacy_station_repair_locked' };
        }
        if (!Array.isArray(inputItems) || !inputItems.length) return { ok: false, reason: 'empty_inputs' };
        if (PharmacyStation.getActiveCraft()) return { ok: false, reason: 'craft_in_progress' };
        if (!window.PharmacyCompounding || typeof window.PharmacyCompounding.validate !== 'function') {
            return { ok: false, reason: 'compounding_unavailable' };
        }

        var selected = StationCraftCore.normalizePharmacyInputs(inputItems);
        var check = window.PharmacyCompounding.validate(selected);
        if (!check.ok) return check;
        var resolvedPreview = window.PharmacyCompounding.resolve(selected);
        if (!resolvedPreview.ok) return resolvedPreview;
        if (!Array.isArray(resolvedPreview.buff_ids) || !resolvedPreview.buff_ids.length) {
            return { ok: false, reason: 'no_effective_component' };
        }

        var i;
        for (i = 0; i < selected.length; i++) {
            var sid = selected[i].item_id;
            if (InventoryHelpers.getInventoryCountByItemId(sid) < selected[i].count) {
                return { ok: false, reason: 'missing_input_items', item_id: sid };
            }
        }
        if (IE && typeof IE.canAcceptItem === 'function' && !IE.canAcceptItem()) {
            return { ok: false, reason: 'inventory_full' };
        }

        var consumedRes = StationCraftCore.consumeInventoryItemsByList(selected);
        if (!consumedRes.ok) {
            StationCraftCore.putItemsBack(consumedRes.consumed || []);
            return { ok: false, reason: 'consume_inputs_failed' };
        }

        window.Survival.advanceTick({source:'pharmacy_compound', intensity:'low'});
        var compoundFailed = resolvedPreview.precipitated === true || (resolvedPreview.conflicts || []).length > 0;
        if (compoundFailed) {
            var residue = { item_id: PharmacyStation.getFailureItemId(), count: 1 };
            PharmacyStation.recordCraftResult(false, [PharmacyStation.deliverCraftOutput(residue)], 'compound');
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('pharmacy.msg.done_fail', { item: StationCraftCore.getItemDisplayNameSafe(residue.item_id) }), 'warn');
            if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
            if (window.SceneRenderer) window.SceneRenderer.render();
            return { ok: false, reason: 'incompatible_compound', consumed: true, failure_item_id: residue.item_id, resolved: resolvedPreview };
        }

        var built = window.PharmacyCompounding.buildInstance(selected);
        if (!built.ok) {
            StationCraftCore.putItemsBack(consumedRes.consumed || []);
            return built;
        }
        if (typeof PharmacyStation.inheritSpoilageOnOutput === 'function') {
            PharmacyStation.inheritSpoilageOnOutput(built.instance, consumedRes.consumed || []);
        }
        PharmacyStation.recordCraftResult(true, [PharmacyStation.deliverCraftOutput(built.instance)], 'compound');
        if (typeof PharmacyStation.addPharmacySuccessProficiency === 'function') PharmacyStation.addPharmacySuccessProficiency(1);
        var res = built.resolved || {};
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('pharmacy.compound.ok', {
            used: String(res.concentration_used != null ? res.concentration_used : 0),
            capacity: String(res.capacity != null ? res.capacity : 0),
            tox: String(res.net_toxicity != null ? res.net_toxicity : 0)
        }), 'success');
        if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (window.SceneRenderer) window.SceneRenderer.render();
        return { ok: true, instance: built.instance, resolved: res };
    }

    function resetCookingStateForNewCharacter() {
        if (window.ManufacturingActions) window.ManufacturingActions.restore(null);
        if (window.CombatMetaSkills) window.CombatMetaSkills.reset();
        if (window.Hunting) window.Hunting.setState(null);
        if (window.FishingSession) window.FishingSession.setState(null);
        if (window.FishingPond) window.FishingPond.setState(null);
        if (!window.SceneCtx) return;
        window.SceneCtx.cooking_station_runtime = window.CookingStation.createDefaultState();
        window.SceneCtx.cooking_temp_stations_runtime = [];
        CookingStation.syncCookingTempStationsIntoMaps();
        window.SceneCtx.known_cooking_recipes = {};
        window.SceneCtx.known_recipe_ids_by_system = {};
        stopCookingCraftIdle();
        if (window.NPCSystem && typeof window.NPCSystem.resetCookingStationRepairQuestFlags === 'function') {
            try { window.NPCSystem.resetCookingStationRepairQuestFlags(); } catch (eNq) { /* ignore */ }
        }
        stopPharmacyCraftIdle();
        window.SceneCtx.pharmacy_station_runtime = window.PharmacyStation.createDefaultState();
        window.SceneCtx.known_pharmacy_recipes = {};
        if (window.NPCSystem && typeof window.NPCSystem.resetPharmacyStationRepairQuestFlags === 'function') {
            try { window.NPCSystem.resetPharmacyStationRepairQuestFlags(); } catch (ePq) { /* ignore */ }
        }
    }

    function canPourWaterAtCurrentTile() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) return false;
        if (!StationContext.isOnCookingStationTile()) return false;
        if (StationContext.isCookingUiBlockedByRepair()) return false;
        var pourCtx = StationContext.getCurrentCookingStationContext();
        if (pourCtx && pourCtx.station_type === 'main' && CookingStation.getState().water_unlimited) return false;
        var slot = InventoryHelpers.findFirstContainerSlotByPredicate(function (cell) {
            return StationCraftCore.getItemWaterPoints(cell.item_id) > 0;
        });
        return !!slot;
    }

    function canAddFuelAtCurrentTile() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) return false;
        if (!StationContext.isOnCookingStationTile()) return false;
        if (StationContext.isCookingUiBlockedByRepair()) return false;
        var slot = InventoryHelpers.findFirstContainerSlotByPredicate(function (cell) {
            return StationCraftCore.getItemFuelPoints(cell.item_id) > 0;
        });
        return !!slot;
    }

    function isFishingPointAtPlayerTile() {
        if (!E || !G || typeof E.getState !== 'function') return false;
        var st = E.getState();
        var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(st.x, st.y) : null;
        var entityId = rec ? (rec.entity_id || null) : (E.getEntityAt ? E.getEntityAt(st.x, st.y) : null);
        if (!entityId) return false;
        var cfg = (typeof G.getGatheringPointConfig === 'function') ? G.getGatheringPointConfig(entityId) : null;
        var cat = cfg && cfg.wild_interaction_category != null ? String(cfg.wild_interaction_category) : '';
        if (cat === 'fishing') return true;
        // 兼容旧数据：未配 category 时允许 fishing 命名实体
        return String(entityId).indexOf('fishing') >= 0;
    }

    function canTakeWaterAtCurrentTile() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) return false;
        if (!isFishingPointAtPlayerTile()) return false;
        return StationCraftCore.hasItemById('tool_bucket_water_empty');
    }

    function onTakeWaterClick() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (!isFishingPointAtPlayerTile()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.take_water.not_fishing'), 'info');
            return;
        }
        if (window.PlayerActions.gatheringIdleTimer) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.take_water.stop_gather_first'), 'info');
            return;
        }
        var slot = InventoryHelpers.findFirstContainerSlotByItemId('tool_bucket_water_empty');
        if (!slot) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.take_water.no_bucket'), 'info');
            return;
        }
        if (!IE || typeof IE.takeItemFromContainer !== 'function' || typeof IE.putItemIntoDefaultContainer !== 'function') return;
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        if (!taken || !taken.success || !taken.item) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.take_water.fail_consume'), 'warn');
            return;
        }
        var placed = IE.putItemIntoDefaultContainer({ item_id: 'tool_bucket_water_full', count: 1 });
        if (!placed || !placed.placed) {
            // 背包塞不下时回滚空桶，避免道具吞没
            IE.putItemIntoDefaultContainer(taken.item);
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.take_water.fail_full'), 'warn');
            return;
        }
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick({ source: 'station' });
        var st = E.getState();
        window.SceneMapView.markCellDirty(st.mapId, st.x, st.y);
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.take_water.ok'), 'success');
        if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function onPourWaterClick(forcedSlot) {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (!StationContext.isOnCookingStationTile()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.station.not_on_tile'), 'info');
            return;
        }
        if (StationContext.isCookingUiBlockedByRepair()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.station.locked_until_repaired'), 'info');
            return;
        }
        var pourCtx0 = StationContext.getCurrentCookingStationContext();
        if (pourCtx0 && pourCtx0.station_type === 'main' && CookingStation.getState().water_unlimited) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.pour_water.main_already_unlimited'), 'info');
            return;
        }
        var slot = resolveCookingSlotOrFirst(forcedSlot, function (cell) {
            return StationCraftCore.getItemWaterPoints(cell.item_id) > 0;
        });
        if (!slot) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui(forcedSlot ? 'cooking.pour_water.slot_invalid' : 'cooking.pour_water.no_item'), 'info');
            return;
        }
        var waterGain = StationCraftCore.getItemWaterPoints(slot.item.item_id);
        if (!(waterGain > 0)) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.pour_water.no_water_value'), 'info');
            return;
        }
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        if (!taken || !taken.success || !taken.item) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.pour_water.fail_take'), 'warn');
            return;
        }
        var cs = CookingStation.getState();
        var before = parseInt(cs.water_points, 10) || 0;
        var afterRaw = before + waterGain;
        var after = Math.min(COOKING_WATER_MAX_POINTS, afterRaw);
        var overflow = Math.max(0, afterRaw - after);
        cs.water_points = after;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick({ source: 'station' });
        window.SceneFeedback.showMsg(
            overflow > 0
                ? window.SceneFeedback.ui('cooking.pour_water.ok_overflow', { gain: waterGain, before: before, after: after, max: COOKING_WATER_MAX_POINTS, overflow: overflow })
                : window.SceneFeedback.ui('cooking.pour_water.ok', { gain: waterGain, before: before, after: after, max: COOKING_WATER_MAX_POINTS }),
            'success'
        );
        if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function onAddFuelClick(forcedSlot) {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (!StationContext.isOnCookingStationTile()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.station.not_on_tile'), 'info');
            return;
        }
        if (StationContext.isCookingUiBlockedByRepair()) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.station.locked_until_repaired'), 'info');
            return;
        }
        var slot = resolveCookingSlotOrFirst(forcedSlot, function (cell) {
            return StationCraftCore.getItemFuelPoints(cell.item_id) > 0;
        });
        if (!slot) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui(forcedSlot ? 'cooking.add_fuel.slot_invalid' : 'cooking.add_fuel.no_item'), 'info');
            return;
        }
        var fuelGain = StationCraftCore.getItemFuelPoints(slot.item.item_id);
        if (!(fuelGain > 0)) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.add_fuel.not_fuel'), 'info');
            return;
        }
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        if (!taken || !taken.success || !taken.item) {
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.add_fuel.fail_take'), 'warn');
            return;
        }
        var cs = CookingStation.getState();
        var before = parseInt(cs.fuel_points, 10) || 0;
        var afterRaw = before + fuelGain;
        var after = Math.min(COOKING_FUEL_MAX_POINTS, afterRaw);
        var overflow = Math.max(0, afterRaw - after);
        cs.fuel_points = after;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick({ source: 'station' });
        window.SceneFeedback.showMsg(
            overflow > 0
                ? window.SceneFeedback.ui('cooking.add_fuel.ok_overflow', { gain: fuelGain, before: before, after: after, max: COOKING_FUEL_MAX_POINTS, overflow: overflow })
                : window.SceneFeedback.ui('cooking.add_fuel.ok', { gain: fuelGain, before: before, after: after, max: COOKING_FUEL_MAX_POINTS }),
            'success'
        );
        if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    /**
     * 烹饪台：**必须**指定当前灶台工艺 `methodId`。燃料/水/world tick/体力一律来自 `cooking-methods.json`（与配方无关）。
     * 在该工艺下按投料 multiset 命中配方；**无命中亦扣料 + 扣技法资源** → 全局失败物（id 见 cooking-system-config.csv）；多命中加权选配方后再判成功率。
     */
    function tryCookAtStation(methodId, inputItems) {
        if (window.SceneAccess.guardPlayerActionBlocked(window.SceneAccess.ACTION_TYPES.CRAFT)) {
            return { ok: false, reason: 'action_disabled', action_type: window.SceneAccess.ACTION_TYPES.CRAFT };
        }
        var stationCtx = StationContext.getCurrentCookingStationContext();
        if (!stationCtx) return { ok: false, reason: 'not_on_cooking_station' };
        if (StationContext.isCookingUiBlockedByRepairForContext(stationCtx)) {
            return { ok: false, reason: 'cooking_station_repair_locked' };
        }
        if (methodId == null || !Array.isArray(inputItems)) return { ok: false, reason: 'bad_args' };
        if (CookingStation.getActiveCraft()) return { ok: false, reason: 'craft_in_progress' };
        var mid = String(methodId).trim();
        if (!mid) return { ok: false, reason: 'method_required' };
        var m = CookingStation.getMethods() && CookingStation.getMethods()[mid] ? CookingStation.getMethods()[mid] : null;
        if (!m) return { ok: false, reason: 'method_not_found', method_id: mid };
        if (!CookingStation.isCookingMethodUnlockedAtStation(mid, stationCtx)) {
            return {
                ok: false,
                reason: 'cooking_method_locked',
                method_id: mid,
                required_accessory_item_id: m.requires_accessory_item_id != null ? m.requires_accessory_item_id : null
            };
        }

        var selected = StationCraftCore.normalizeCookingInputs(inputItems);
        if (!selected.length) return { ok: false, reason: 'empty_inputs' };
        var i;
        for (i = 0; i < selected.length; i++) {
            var sid = selected[i].item_id;
            if (!StationCraftCore.isItemAllowedCookingIngredient(sid)) {
                return { ok: false, reason: 'not_cooking_ingredient', item_id: sid };
            }
            if (InventoryHelpers.getInventoryCountByItemId(sid) < selected[i].count) {
                return { ok: false, reason: 'missing_input_items', item_id: sid };
            }
        }

        var matched = StationCraftCore.matchCookingRecipesByInputs(selected, mid);

        var needFuel = Math.max(0, parseInt(m.fuel_cost, 10) || 0);
        var needWater = Math.max(0, parseInt(m.water_cost, 10) || 0);
        var needTicks = Math.max(0, parseInt(m.craft_ticks, 10) || 0);
        var needStamina = StationCraftCore.methodStamina(mid, needTicks);
        var cs = CookingStation.getState();
        var curFuel = parseInt(cs.fuel_points, 10) || 0;
        var curWater = parseInt(cs.water_points, 10) || 0;
        var mainWaterFree = !!(stationCtx && stationCtx.station_type === 'main' && cs.water_unlimited);
        if (curFuel < needFuel) return { ok: false, reason: 'insufficient_fuel', need: needFuel, current: curFuel };
        if (!mainWaterFree && curWater < needWater) return { ok: false, reason: 'insufficient_water', need: needWater, current: curWater };
        var survState = window.Survival && typeof window.Survival.getState === 'function' ? window.Survival.getState() : null;
        var curStamina = survState ? Number(survState.stamina || 0) : 0;
        if (curStamina < (window.Survival.getActionStaminaCost ? window.Survival.getActionStaminaCost(needStamina) : needStamina)) return { ok: false, reason: 'insufficient_stamina', need: needStamina, current: curStamina };
        if (IE && typeof IE.canAcceptItem === 'function' && !IE.canAcceptItem()) {
            return { ok: false, reason: 'inventory_full' };
        }

        var consumedRes = StationCraftCore.consumeInventoryItemsByList(selected);
        if (!consumedRes.ok) {
            StationCraftCore.putItemsBack(consumedRes.consumed || []);
            return { ok: false, reason: 'consume_inputs_failed' };
        }

        cs.fuel_points = curFuel - needFuel;
        if (!mainWaterFree) cs.water_points = curWater - needWater;

        // 固定 tick 耗时：开做即扣资源，但时间按 world tick 递减；制作中不可移动
        var cs2 = CookingStation.getState();
        var gt = window.GameTime && typeof window.GameTime.getState === 'function' ? window.GameTime.getState() : null;
        cs2.active_craft = {
            remaining_ticks: Math.max(1, needTicks),
            intensity: StationCraftCore.methodIntensity(mid),
            started_total_ticks: gt && typeof gt.totalTicks === 'number' ? gt.totalTicks : 0,
            method_id: mid,
            inputs: selected,
            consumed_items: consumedRes.consumed || [],
            station_ref: {
                station_type: stationCtx.station_type || 'main',
                map_id: stationCtx.map_id,
                x: stationCtx.x,
                y: stationCtx.y
            }
        };
        window.PlayerActions.stopGatheringIdle();
        window.WorldTick.patchSurvivalTickForCookingCraftOnce();
        startCookingCraftIdleIfNeeded();
        window.SceneFeedback.showMsg(window.SceneFeedback.ui('cooking.msg.started', { n: Math.max(1, needTicks) }), 'info');
        if (typeof window.InventoryPanel.updateBackpackPanel === 'function') window.InventoryPanel.updateBackpackPanel();
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (window.SceneRenderer) window.SceneRenderer.render();
        return {
            ok: true,
            started: true,
            method_id: mid,
            remaining_ticks: Math.max(1, needTicks),
            consumed: { fuel: needFuel, water: needWater, ticks: needTicks, stamina: 0 }
        };
    }
    function getKnownCookingRecipeIds() {
        var o = window.SceneCtx && window.SceneCtx.known_cooking_recipes;
        if (!o || typeof o !== 'object') return [];
        var a = [];
        var k;
        for (k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k) && o[k]) a.push(String(k));
        }
        a.sort();
        return a;
    }

    function getCookingStationAccessories() {
        return CookingStation.getState().installed_accessory_item_ids.slice();
    }

    function getKnownPharmacyRecipeIds() {
        var o = window.SceneCtx && window.SceneCtx.known_pharmacy_recipes;
        if (!o || typeof o !== 'object') o = {};
        var a = [];
        var k;
        for (k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k) && o[k]) a.push(String(k));
        }
        if(window.ManufacturingKnowledge.knows('manufacturing.medical_alcohol')&&!a.includes('life_pharmacy.medical_alcohol'))a.push('life_pharmacy.medical_alcohol');
        a.sort();
        return a;
    }

    function setCookingStationAccessories(ids) {
        var s = CookingStation.getState();
        if (!Array.isArray(ids)) {
            s.installed_accessory_item_ids = [];
            return;
        }
        var seen = {};
        var out = [];
        var i;
        for (i = 0; i < ids.length; i++) {
            var z = String(ids[i] || '').trim();
            if (!z || seen[z]) continue;
            seen[z] = true;
            out.push(z);
        }
        s.installed_accessory_item_ids = out;
    }

    function placeTempCookingStation(mapId, x, y, options) {
        return CookingStation.placeTempCookingStation(mapId, x, y, options || {});
    }

    function removeTempCookingStation(mapId, x, y) {
        CookingStation.removeCookingTempStationAt(String(mapId || ''), Math.floor(Number(x)), Math.floor(Number(y)));
        CookingStation.syncCookingTempStationsIntoMaps();
        window.SceneMapView.markCellDirty(String(mapId || ''), Math.floor(Number(x)), Math.floor(Number(y)));
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function initialize() {
        COOKING_FUEL_MAX_POINTS = 1000;
        COOKING_WATER_MAX_POINTS = 1000;
        COOKING_BASE_STATION_UNLOCK_FLAG = 'cooking_base_station_unlocked';
        cookingCraftIdleTimer = null;
        pharmacyCraftIdleTimer = null;
        COOKING_DEFAULT_PROCESSOR_ID = 'processor.life_cooking.default';
        cookingRecipeProcessorRegistered = false;
        PHARMACY_DEFAULT_PROCESSOR_ID = 'processor.life_pharmacy.default';
        PHARMACY_BASE_STATION_UNLOCK_FLAG = 'npc_station_pharmacy_base_repaired';
        PHARMACY_WATER_MAX_POINTS = 100;
        DEFAULT_PHARMACY_INSTALLED_ACCESSORIES = [];
        pharmacyRecipeProcessorRegistered = false;
        DEFAULT_COOKING_INSTALLED_ACCESSORIES = [];
    }

    function bind() {

    if (document.getElementById('player-action-take-water')) {
        document.getElementById('player-action-take-water').addEventListener('click', onTakeWaterClick);
    }

    if (document.getElementById('player-action-pour-water')) {
        document.getElementById('player-action-pour-water').addEventListener('click', onPourWaterClick);
    }

    if (document.getElementById('player-action-add-fuel')) {
        document.getElementById('player-action-add-fuel').addEventListener('click', onAddFuelClick);
    }
    }

    window.StationActions = {
        initialize: initialize,
        bind: bind,
        canAddFuelAtCurrentTile: canAddFuelAtCurrentTile,
        canPourWaterAtCurrentTile: canPourWaterAtCurrentTile,
        canTakeWaterAtCurrentTile: canTakeWaterAtCurrentTile,
        getCookingStationAccessories: getCookingStationAccessories,
        getKnownCookingRecipeIds: getKnownCookingRecipeIds,
        getKnownPharmacyRecipeIds: getKnownPharmacyRecipeIds,
        onAddFuelClick: onAddFuelClick,
        onPourWaterClick: onPourWaterClick,
        onTakeWaterClick: onTakeWaterClick,
        placeTempCookingStation: placeTempCookingStation,
        registerCookingRecipeProcessorIfNeeded: registerCookingRecipeProcessorIfNeeded,
        registerPharmacyRecipeProcessorIfNeeded: registerPharmacyRecipeProcessorIfNeeded,
        removeTempCookingStation: removeTempCookingStation,
        resetCookingStateForNewCharacter: resetCookingStateForNewCharacter,
        setCookingStationAccessories: setCookingStationAccessories,
        startCookingCraftIdleIfNeeded: startCookingCraftIdleIfNeeded,
        startPharmacyCraftIdleIfNeeded: startPharmacyCraftIdleIfNeeded,
        stopCookingCraftIdle: stopCookingCraftIdle,
        stopPharmacyCraftIdle: stopPharmacyCraftIdle,
        tickPharmacyTempStationsAfterWorldTick: tickPharmacyTempStationsAfterWorldTick,
        tryCompoundAtStation: tryCompoundAtStation,
        tryCookAtStation: tryCookAtStation,
        tryPharmacyAtStation: tryPharmacyAtStation
    };
})(window);
