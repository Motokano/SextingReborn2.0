/**
 * AgricultureActions — 农业作业、扣料退料、收获与农业会话.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var IE = window.InventoryEquipment;
    var PLANTING_SKILL_ID, agriculturePanelOpen, agricultureAutoTickTimer, agricultureCropDefsDoc, agricultureSoilsDoc, agricultureTaskMeta, AGRICULTURE_BUILD_TASK_BY_ID;

    function buildAgricultureEnv() {
        var AC = window.AgricultureConfig;
        return {
            cropDefsDoc: agricultureCropDefsDoc,
            soilsDoc: agricultureSoilsDoc,
            resolveInjectParams: AC && typeof AC.getInjectableParams === 'function'
                ? function (itemId) {
                    var p = AC.getInjectableParams(itemId);
                    if (!p || !p.item_id) return null;
                    var out = {
                        name: itemId,
                        injectFacility: p.inject_facility || ''
                    };
                    if (p.agriculture_fertilizer_per_tick != null && isFinite(p.agriculture_fertilizer_per_tick)) {
                        out.fertilizerPerTick = Number(p.agriculture_fertilizer_per_tick);
                    }
                    if (p.agriculture_nutrient_per_bottle != null && isFinite(p.agriculture_nutrient_per_bottle)) {
                        out.nutrientPerBottle = Number(p.agriculture_nutrient_per_bottle);
                    }
                    if (p.agriculture_venturi_effect_duration_ticks != null) {
                        out.effectDurationTicks = Math.max(1, Math.floor(Number(p.agriculture_venturi_effect_duration_ticks)));
                    }
                    if (IE && typeof IE.getItemTemplate === 'function') {
                        var tpl = IE.getItemTemplate(itemId);
                        if (tpl && tpl.sn) out.name = String(tpl.sn);
                    }
                    return out;
                }
                : undefined
        };
    }

    function isAgricultureUnlocked() {
        return !!(window.SceneCtx && window.SceneCtx.agriculture_unlocked);
    }

    function unlockAgriculture() {
        if (!window.SceneCtx) return;
        window.SceneCtx.agriculture_unlocked = true;
        AgricultureMap.ensureState();
    }

    function getAgricultureTaskSpecFromMeta(meta) {
        if (meta && meta.spec) {
            var config = window.AgricultureConfig;
            var id = meta.buildId || '';
            var current = config?.getBuildSpec(id);
            if (id.startsWith('venturi_upgrade:')) current = config?.getVenturiUpgradeSpec(Number(id.split(':')[1]));
            return Object.assign({}, meta.spec, {stamina_per_tick:current?.stamina_per_tick ?? 1});
        }
        if (window.AgricultureConfig && typeof window.AgricultureConfig.getTaskDefaults === 'function') {
            return window.AgricultureConfig.getTaskDefaults();
        }
        return { task_ticks: 10, stamina_per_tick: 1 };
    }

    function getAgricultureConstructionCtx(spec) {
        var liveState = window.AgricultureMap && typeof window.AgricultureMap.getState === 'function'
            ? window.AgricultureMap.getState() : null;
        var persistedMeta = liveState && liveState.task && liveState.task.paymentMeta;
        var taskSpec = spec || getAgricultureTaskSpecFromMeta(agricultureTaskMeta || persistedMeta);
        return {
            panelOpen: true,
            taskTicks: taskSpec.task_ticks != null ? taskSpec.task_ticks : 10,
            staminaPerTick: window.Survival.getActionStaminaCost(taskSpec.stamina_per_tick ?? 1),
            staminaAlreadyPaid: true
        };
    }

    function tickAgricultureAfterWorldTick(playerWasInComa, source) {
        if (window.FacilityLabor && !window.FacilityLabor.isUnlocked('agriculture')) return;
        if (!isAgricultureUnlocked()) return;
        var AM = window.AgricultureMap;
        if (!AM || typeof AM.runAgricultureMapTick !== 'function') return;
        var st = AgricultureMap.ensureState();
        if (!st) return;
        var env = buildAgricultureEnv();
        try { AM.runAgricultureMapTick(st, env); } catch (eRun) { /* ignore */ }
        AgricultureMap.mirrorStateTick(st);
        if (!playerWasInComa && source === 'agriculture_work' && agriculturePanelOpen && st.task && typeof AM.advanceConstructionTask === 'function') {
            var prevHadTask = !!st.task;
            try {
                AM.advanceConstructionTask(st, getAgricultureConstructionCtx());
            } catch (eConstr) { /* ignore */ }
            if (prevHadTask && !st.task) agricultureTaskMeta = null;
        }
        if (agriculturePanelOpen && !(window.SaveSystem && window.SaveSystem.isAtomic()) && window.AgriculturePanel && typeof window.AgriculturePanel.update === 'function') {
            try { window.AgriculturePanel.update(st); } catch (eUi) { /* ignore */ }
        }
    }

    function resolveAgricultureBuildTask(buildId) {
        var id = String(buildId || '').trim();
        if (!id) return null;
        if (id.indexOf('crop_structure_') === 0 && id !== 'crop_structure_remove') {
            return { taskType: 'build_crop_structure', structureId: id.slice('crop_structure_'.length) };
        }
        var taskType = AGRICULTURE_BUILD_TASK_BY_ID[id];
        if (!taskType) return null;
        return { taskType: taskType, structureId: null };
    }

    function validateAgricultureBuildTarget(st, buildId, x, y) {
        var AM = window.AgricultureMap;
        if (!AM || typeof AM.cell !== 'function') return { ok: false, reason: 'agriculture_map_missing' };
        var c = AM.cell(st, x, y);
        if (!c) return { ok: false, reason: 'out_of_bounds' };
        var id = String(buildId || '').trim();
        var defCap = AM.constants && AM.constants.defaultChannelCapacity != null
            ? Number(AM.constants.defaultChannelCapacity) : 2;
        if (id === 'channel_dig') {
            if (c.kind !== 'land' || c.crop || c.cropStructure) return { ok: false, reason: 'invalid_cell' };
        } else if (id === 'channel_remove' || id === 'channel_upgrade') {
            if (c.kind !== 'channel') return { ok: false, reason: 'not_channel' };
        } else if (id === 'channel_downgrade') {
            if (c.kind !== 'channel') return { ok: false, reason: 'not_channel' };
            if ((Number(c.capacity) || defCap) <= defCap) return { ok: false, reason: 'channel_at_min_capacity' };
        } else if (id === 'land_reclaim') {
            if (c.kind !== 'land' || c.tilled || c.crop) return { ok: false, reason: 'invalid_cell' };
        } else if (id === 'land_remove_reclaim') {
            if (c.kind !== 'land' || !c.tilled || c.crop || c.cropStructure) return { ok: false, reason: 'invalid_cell' };
        } else if (id === 'venturi_fertilizer' || id === 'buried_pot_jar' || id === 'super_fusion') {
            if (c.kind !== 'land' || c.crop || c.cropStructure) return { ok: false, reason: 'invalid_cell' };
        } else if (id === 'crop_structure_remove') {
            if (c.kind !== 'land' || !c.tilled || !c.cropStructure || c.crop) return { ok: false, reason: 'crop_structure_occupied' };
        } else if (id === 'venturi_fertilizer_remove' || id === 'buried_pot_jar_remove' || id === 'super_fusion_remove') {
            if (c.kind !== id.slice(0, -7)) return { ok: false, reason: 'wrong_facility' };
        } else if (id.indexOf('crop_structure_') === 0 && id !== 'crop_structure_remove') {
            if (c.kind !== 'land' || !c.tilled || c.crop || c.cropStructure) return { ok: false, reason: 'invalid_cell' };
        }
        return { ok: true };
    }

    function refundAgricultureTaskInputs(meta) {
        if (!meta || !meta.spec || meta.spec.refund_inputs_on_cancel !== true) return true;
        if (!IE || typeof IE.putItemIntoDefaultContainer !== 'function') return false;
        var consumed = Array.isArray(meta.consumed) ? meta.consumed : [];
        var i;
        for (i = 0; i < consumed.length; i++) {
            var row = consumed[i];
            if (!row || !row.item_id) continue;
            var refund = IE.putItemIntoDefaultContainer({
                item_id: row.item_id,
                count: Math.max(1, Math.floor(Number(row.count) || 1))
            });
            if (!refund || !refund.placed) return false;
        }
        return true;
    }

    function addAgricultureHarvestProficiency(count) {
        var n = Math.max(0, Math.floor(Number(count) || 0));
        if (n < 1) return;
        CompostPanel.ensureLifePlantingSkillEntry();
        if (IE && typeof IE.incrementSkillMoveUsage === 'function') {
            IE.incrementSkillMoveUsage(PLANTING_SKILL_ID, 'harvest', n);
            window.SceneCharacter.recalcCharacterStatsFromIE();
        }
    }

    function findCropDefByCropId(cropId) {
        var id = String(cropId || '').trim();
        if (!id || !agricultureCropDefsDoc || !agricultureCropDefsDoc.crops) return null;
        return agricultureCropDefsDoc.crops[id] || null;
    }

    function findCropDefBySeedItemId(seedItemId) {
        var sid = String(seedItemId || '').trim();
        if (!sid || !agricultureCropDefsDoc || !agricultureCropDefsDoc.crops) return null;
        var crops = agricultureCropDefsDoc.crops;
        var k;
        for (k in crops) {
            if (!Object.prototype.hasOwnProperty.call(crops, k)) continue;
            var d = crops[k];
            if (d && String(d.seedItemId || '') === sid) return d;
        }
        return null;
    }

    function getSoilDisplayName(soilId) {
        var id = String(soilId || '').trim();
        if (agricultureSoilsDoc && agricultureSoilsDoc.soils && agricultureSoilsDoc.soils[id]) {
            return String(agricultureSoilsDoc.soils[id].display_name || id);
        }
        return id;
    }

    function tryAgricultureInjectFacilityLiquid(st, x, y, facilityKind, itemId) {
        var AM = window.AgricultureMap;
        if (!AM || typeof AM.cell !== 'function') return { ok: false, reason: 'agriculture_map_missing' };
        var c = AM.cell(st, x, y);
        if (!c || c.kind !== facilityKind) return { ok: false, reason: 'wrong_facility' };
        var AC = window.AgricultureConfig;
        if (!AC || typeof AC.getInjectableParams !== 'function') return { ok: false, reason: 'config_missing' };
        var p = AC.getInjectableParams(itemId);
        if (!p) return { ok: false, reason: 'not_injectable' };
        if (facilityKind === 'venturi_fertilizer' && !p.agriculture_venturi_injectable) {
            return { ok: false, reason: 'not_venturi_injectable' };
        }
        if (facilityKind === 'buried_pot_jar' && !p.agriculture_buried_jar_injectable) {
            return { ok: false, reason: 'not_jar_injectable' };
        }
        if (typeof AM.tryLoadFacilityBottleAt === 'function') {
            if (typeof AM.bindEnv === 'function') AM.bindEnv(buildAgricultureEnv());
            var inj = AM.tryLoadFacilityBottleAt(st, x, y, facilityKind, itemId);
            if (inj && inj.ok) return { ok: true, facility: facilityKind, item_id: itemId };
            return inj || { ok: false, reason: 'inject_failed' };
        }
        var liqNow = c.jarLiquid;
        if (liqNow && liqNow.itemId && liqNow.itemId !== itemId && liqNow.units > 0) {
            return { ok: false, reason: 'jar_mixed_liquid' };
        }
        var nm = getSoilDisplayName(itemId);
        if (IE && typeof IE.getItemTemplate === 'function') {
            var tpl = IE.getItemTemplate(itemId);
            if (tpl && tpl.sn) nm = String(tpl.sn);
        }
        if (!liqNow || !liqNow.units) {
            c.jarLiquid = { itemId: itemId, name: nm, units: 1 };
        } else {
            liqNow.units += 1;
        }
        return { ok: true, facility: facilityKind, item_id: itemId };
    }

    function applyAgricultureAction(actionId, params) {
        params = params || {};
        if (!canUseOutdoorFacility('agriculture')) return { ok: false, reason: 'not_adjacent' };
        if (!isAgricultureUnlocked() || (window.FacilityLabor && !window.FacilityLabor.isUnlocked('agriculture'))) return { ok: false, reason: 'agriculture_locked' };
        var AM = window.AgricultureMap;
        var API = window.AgriculturePlayerItems;
        if (!AM) return { ok: false, reason: 'agriculture_map_missing' };
        var st = AgricultureMap.ensureState();
        if (!st) return { ok: false, reason: 'no_map_state' };
        var action = String(actionId || '').trim();
        var x = Number(params.x);
        var y = Number(params.y);
        var env = buildAgricultureEnv();
        if (['advance_ticks', 'cancel_task', 'feed_power', 'unlock'].indexOf(action) < 0 &&
            (!Number.isInteger(x) || !Number.isInteger(y) || !AM.cell(st, x, y))) return { ok: false, reason: 'invalid_cell' };

        if (action === 'clear_crop') return AM.tryClearCropAt(st, x, y);
        if (action === 'set_jar_release') {
            if (!Number.isFinite(Number(params.value))) return { ok: false, reason: 'missing_params' };
            return AM.trySetJarReleaseRateAt(st, x, y, Number(params.value));
        }
        if (action === 'feed_power') return feedAgriculturePower(st, params);

        if (action === 'advance_ticks') {
            if (!agriculturePanelOpen) return { ok: false, reason: 'panel_closed' };
            var n = Math.max(1, Math.floor(Number(params.n) || 1));
            var advanced = 0;
            var i;
            var lastResult = null;
            for (i = 0; i < n; i++) {
                lastResult = tickAgriculturePanelWorldOnce();
                if (!lastResult || !lastResult.ok) break;
                advanced += 1;
                if (lastResult.death) break;
            }
            if (advanced <= 0) {
                return { ok: false, reason: (lastResult && lastResult.reason) || 'tick_failed' };
            }
            return { ok: true, advanced: advanced, tick: window.WorldTick.getWorldTotalTicks() };
        }

        if (action === 'cancel_task') {
            if (!st.task) return { ok: false, reason: 'no_task' };
            if (!refundAgricultureTaskInputs(agricultureTaskMeta || st.task.paymentMeta)) return { ok: false, reason: 'inventory_full' };
            st.task = null;
            agricultureTaskMeta = null;
            return { ok: true, cancelled: true };
        }

        if (action === 'start_build_task') {
            if (st.task) return { ok: false, reason: 'task_busy' };
            var buildId = String(params.buildId || '').trim();
            var taskMeta = resolveAgricultureBuildTask(buildId);
            if (!taskMeta) return { ok: false, reason: 'unknown_build' };
            var targetCheck = validateAgricultureBuildTarget(st, buildId, x, y);
            if (!targetCheck || !targetCheck.ok) return targetCheck || { ok: false, reason: 'invalid_cell' };
            if (!API || typeof API.payBuildCost !== 'function') return { ok: false, reason: 'player_items_missing' };
            var pay = API.payBuildCost(buildId);
            if (!pay || !pay.ok) return { ok: false, reason: (pay && pay.reason) || 'pay_failed', buildId: buildId };
            if (API.canAffordTaskStamina && typeof API.canAffordTaskStamina === 'function' && !API.canAffordTaskStamina(pay.spec)) {
                refundAgricultureTaskInputs({ spec: pay.spec, consumed: pay.consumed });
                return { ok: false, reason: 'insufficient_stamina' };
            }
            st.task = {
                type: taskMeta.taskType,
                x: x,
                y: y,
                progress: 0,
                paused: false
            };
            if (taskMeta.structureId) st.task.structureId = taskMeta.structureId;
            if (params.soilId) st.task.soilId = String(params.soilId);
            if (params.soilType) st.task.soilType = String(params.soilType);
            agricultureTaskMeta = { buildId: buildId, spec: pay.spec, consumed: pay.consumed || [] };
            st.task.paymentMeta = agricultureTaskMeta;
            return { ok: true, task: st.task, buildId: buildId };
        }

        if (action === 'start_soil_amend_task') {
            if (st.task) return { ok: false, reason: 'task_busy' };
            var amendCell = AM.cell(st, x, y);
            if (!amendCell || amendCell.kind !== 'land' || amendCell.crop) return { ok: false, reason: 'invalid_cell' };
            var amendItemId = String(params.itemId || '').trim();
            var AC = window.AgricultureConfig;
            if (!AC || typeof AC.getGrantsSoilId !== 'function') return { ok: false, reason: 'config_missing' };
            var grantsSoil = AC.getGrantsSoilId(amendItemId);
            if (!grantsSoil) return { ok: false, reason: 'not_soil_amend' };
            if (!API || typeof API.consumeInputs !== 'function') return { ok: false, reason: 'player_items_missing' };
            var amendPay = API.consumeInputs([{ item_id: amendItemId, count: 1 }]);
            if (!amendPay || !amendPay.ok) return { ok: false, reason: (amendPay && amendPay.reason) || 'insufficient_items' };
            st.task = {
                type: 'soil_amend',
                x: x,
                y: y,
                progress: 0,
                paused: false,
                soilId: grantsSoil,
                soilType: getSoilDisplayName(grantsSoil),
                itemId: amendItemId
            };
            agricultureTaskMeta = {
                buildId: 'soil_amend:' + amendItemId,
                spec: window.AgricultureConfig.getTaskDefaults ? window.AgricultureConfig.getTaskDefaults() : { task_ticks: 10, stamina_per_tick: 1 },
                consumed: amendPay.consumed || []
            };
            st.task.paymentMeta = agricultureTaskMeta;
            return { ok: true, task: st.task, soilId: grantsSoil };
        }

        if (action === 'start_venturi_upgrade') {
            if (st.task) return { ok: false, reason: 'task_busy' };
            if (!AM.cell) return { ok: false, reason: 'agriculture_map_missing' };
            var vc = AM.cell(st, x, y);
            if (!vc || vc.kind !== 'venturi_fertilizer') return { ok: false, reason: 'not_venturi' };
            var fromLv = Math.max(1, Math.floor(Number(vc.venturiLevel) || 1));
            if (!API || typeof API.payVenturiUpgrade !== 'function') return { ok: false, reason: 'player_items_missing' };
            var upPay = API.payVenturiUpgrade(fromLv);
            if (!upPay || !upPay.ok) return { ok: false, reason: (upPay && upPay.reason) || 'upgrade_pay_failed' };
            if (!API.canAffordTaskStamina(upPay.spec)) {
                refundAgricultureTaskInputs({ spec: upPay.spec, consumed: upPay.consumed });
                return { ok: false, reason: 'insufficient_stamina' };
            }
            st.task = { type: 'upgrade_venturi', x: x, y: y, progress: 0, paused: false };
            agricultureTaskMeta = { buildId: 'venturi_upgrade:' + fromLv, spec: upPay.spec, consumed: upPay.consumed || [] };
            st.task.paymentMeta = agricultureTaskMeta;
            return { ok: true, task: st.task, from_level: fromLv };
        }

        if (action === 'start_pool_upgrade') {
            return { ok: false, reason: 'fixed_pool' };
            if (st.task) return { ok: false, reason: 'task_busy' };
            if (!AM.cell) return { ok: false, reason: 'agriculture_map_missing' };
            var pc = AM.cell(st, x, y);
            if (!pc || pc.kind !== 'pool') return { ok: false, reason: 'not_pool' };
            var poolFromLv = typeof AM.getPoolLevel === 'function'
                ? AM.getPoolLevel(st)
                : Math.max(1, Math.floor(Number(st.pool_level) || 1));
            var ACpool = window.AgricultureConfig;
            var poolMaxLv = ACpool && typeof ACpool.getPoolMaxLevel === 'function' ? ACpool.getPoolMaxLevel() : 4;
            if (poolFromLv >= poolMaxLv) return { ok: false, reason: 'pool_max_level' };
            if (!API || typeof API.payPoolUpgrade !== 'function') return { ok: false, reason: 'player_items_missing' };
            var poolPay = API.payPoolUpgrade(poolFromLv);
            if (!poolPay || !poolPay.ok) return { ok: false, reason: (poolPay && poolPay.reason) || 'upgrade_pay_failed' };
            if (!API.canAffordTaskStamina(poolPay.spec)) {
                refundAgricultureTaskInputs({ spec: poolPay.spec, consumed: poolPay.consumed });
                return { ok: false, reason: 'insufficient_stamina' };
            }
            st.task = { type: 'upgrade_pool', x: x, y: y, progress: 0, paused: false };
            agricultureTaskMeta = {
                buildId: 'pool_upgrade:' + poolFromLv,
                spec: poolPay.spec,
                consumed: poolPay.consumed || []
            };
            return { ok: true, task: st.task, from_level: poolFromLv };
        }

        if (action === 'pool_theft_set') {
            return { ok: false, reason: 'fixed_pool' };
            if (typeof AM.getPoolLevel !== 'function') return { ok: false, reason: 'agriculture_map_missing' };
            if (AM.getPoolLevel(st) < 2) return { ok: false, reason: 'pool_theft_locked' };
            if (!st.pool_theft) {
                st.pool_theft = { enabled: false, victim_branch_index: 1, gain_branch_index: 2 };
            }
            if (params.enabled != null) st.pool_theft.enabled = !!params.enabled;
            if (params.victim_branch_index != null) {
                st.pool_theft.victim_branch_index = Math.max(1, Math.floor(Number(params.victim_branch_index) || 1));
            }
            if (params.gain_branch_index != null) {
                st.pool_theft.gain_branch_index = Math.max(1, Math.floor(Number(params.gain_branch_index) || 2));
            }
            if (st.pool_theft.victim_branch_index >= st.pool_theft.gain_branch_index) {
                st.pool_theft.gain_branch_index = st.pool_theft.victim_branch_index + 1;
            }
            return { ok: true, pool_theft: st.pool_theft };
        }

        if (action === 'step_venturi_concentration') {
            if (typeof AM.cell !== 'function' || typeof AM.trySetSeaweedConcentrationAt !== 'function') {
                return { ok: false, reason: 'unavailable' };
            }
            var vcConc = AM.cell(st, x, y);
            if (!vcConc || vcConc.kind !== 'venturi_fertilizer') return { ok: false, reason: 'not_venturi' };
            var curConc = Number(vcConc.seaweedSetConcentration);
            if (!(curConc >= 0)) curConc = 7;
            var delta = Number(params.delta != null ? params.delta : params.step);
            if (!isFinite(delta) || delta === 0) return { ok: false, reason: 'missing_params' };
            return AM.trySetSeaweedConcentrationAt(st, x, y, curConc + delta);
        }

        if (action === 'step_jar_release') {
            if (typeof AM.cell !== 'function' || typeof AM.trySetJarReleaseRateAt !== 'function') {
                return { ok: false, reason: 'unavailable' };
            }
            var jarCell = AM.cell(st, x, y);
            if (!jarCell || jarCell.kind !== 'buried_pot_jar') return { ok: false, reason: 'not_jar' };
            var jarCurrent = Number(jarCell.jarReleaseRate) || 0;
            var jarDelta = Number(params.delta != null ? params.delta : params.step);
            if (!isFinite(jarDelta) || jarDelta === 0) return { ok: false, reason: 'missing_params' };
            return AM.trySetJarReleaseRateAt(st, x, y, jarCurrent + jarDelta);
        }

        if (action === 'plant') {
            if (st.task) return { ok: false, reason: 'task_busy' };
            var cropId = String(params.cropId || '').trim();
            var cropDef = findCropDefByCropId(cropId);
            if (!cropDef) return { ok: false, reason: 'unknown_crop' };
            var seedId = String(params.seedItemId || cropDef.seedItemId || '').trim();
            if (!seedId) return { ok: false, reason: 'no_seed' };
            if (seedId !== cropDef.seedItemId) return { ok: false, reason: 'invalid_seed' };
            if (!API || typeof API.consumeInputs !== 'function') return { ok: false, reason: 'player_items_missing' };
            var seedPay = API.consumeInputs([{ item_id: seedId, count: 1 }]);
            if (!seedPay || !seedPay.ok) return { ok: false, reason: (seedPay && seedPay.reason) || 'no_seed' };
            var plantRes = typeof AM.tryPlantCropAt === 'function'
                ? AM.tryPlantCropAt(st, env, x, y, cropId)
                : { ok: false, reason: 'plant_unavailable' };
            if (!plantRes || !plantRes.ok) {
                if (Array.isArray(seedPay.consumed)) {
                    refundAgricultureTaskInputs({ spec: { refund_inputs_on_cancel: true }, consumed: seedPay.consumed });
                }
                return plantRes || { ok: false, reason: 'plant_failed' };
            }
            return plantRes;
        }

        if (action === 'harvest') {
            if (st.task) return { ok: false, reason: 'task_busy' };
            var harvestPeek = typeof AM.peekHarvestAt === 'function' ? AM.peekHarvestAt : AM.tryHarvestAt;
            if (typeof harvestPeek !== 'function') return { ok: false, reason: 'harvest_unavailable' };
            var harvestPreview = harvestPeek(st, x, y);
            if (!harvestPreview || !harvestPreview.ok) return harvestPreview || { ok: false, reason: 'not_harvestable' };
            var wantCount = Math.max(0, Math.floor(Number(harvestPreview.harvestCount) || 0));
            var itemId = String(harvestPreview.itemId || '').trim();
            var placed = 0;
            if (wantCount > 0 && itemId && IE && typeof IE.putItemIntoDefaultContainer === 'function') {
                var hi;
                for (hi = 0; hi < wantCount; hi++) {
                    var pr = IE.putItemIntoDefaultContainer({ item_id: itemId, count: 1 });
                    if (pr && pr.placed) placed += 1;
                    else break;
                }
            }
            if (wantCount > 0 && placed === 0) {
                return {
                    ok: false,
                    reason: 'inventory_full',
                    cropId: harvestPreview.cropId,
                    itemId: itemId,
                    harvestCount: wantCount,
                    placedCount: 0,
                    result: harvestPreview.result
                };
            }
            if (wantCount === 0 && typeof AM.commitHarvestAt === 'function') {
                AM.commitHarvestAt(st, x, y);
            } else if (placed > 0 && typeof AM.commitHarvestAt === 'function' && placed === wantCount) {
                AM.commitHarvestAt(st, x, y);
            } else if (placed > 0 && placed < wantCount && typeof AM.cell === 'function') {
                var plotAfterPartial = AM.cell(st, x, y);
                if (plotAfterPartial && plotAfterPartial.crop) {
                    plotAfterPartial.crop.harvestCount = Math.max(0, wantCount - placed);
                }
            }
            addAgricultureHarvestProficiency(placed);
            return {
                ok: true,
                cropId: harvestPreview.cropId,
                itemId: itemId,
                harvestCount: wantCount,
                placedCount: placed,
                result: harvestPreview.result
            };
        }

        if (action === 'inject_facility') {
            if (st.task) return { ok: false, reason: 'task_busy' };
            var facilityKind = String(params.facilityKind || params.facility || '').trim();
            var injectItemId = String(params.itemId || '').trim();
            if (!facilityKind || !injectItemId) return { ok: false, reason: 'missing_params' };
            if (!API || typeof API.consumeInputs !== 'function') return { ok: false, reason: 'player_items_missing' };
            var liqPay = API.consumeInputs([{ item_id: injectItemId, count: 1 }]);
            if (!liqPay || !liqPay.ok) return { ok: false, reason: (liqPay && liqPay.reason) || 'insufficient_items' };
            var injRes = tryAgricultureInjectFacilityLiquid(st, x, y, facilityKind, injectItemId);
            if (!injRes || !injRes.ok) {
                refundAgricultureTaskInputs({ spec: { refund_inputs_on_cancel: true }, consumed: liqPay.consumed });
                return injRes || { ok: false, reason: 'inject_failed' };
            }
            return injRes;
        }

        if (action === 'set_venturi_concentration') {
            if (typeof AM.trySetSeaweedConcentrationAt !== 'function') return { ok: false, reason: 'unavailable' };
            return AM.trySetSeaweedConcentrationAt(st, x, y, params.value != null ? params.value : params.concentration);
        }

        if (action === 'till') {
            if (st.task) return { ok: false, reason: 'task_busy' };
            return typeof AM.tryTillAt === 'function' ? AM.tryTillAt(st, x, y) : { ok: false, reason: 'unavailable' };
        }

        if (action === 'unlock') {
            unlockAgriculture();
            return { ok: true, unlocked: true };
        }

        return { ok: false, reason: 'unknown_action', actionId: action };
    }

    function payAgricultureBuildCost(buildId) {
        if (!window.AgriculturePlayerItems || typeof window.AgriculturePlayerItems.payBuildCost !== 'function') {
            return { ok: false, reason: 'player_items_missing' };
        }
        return window.AgriculturePlayerItems.payBuildCost(buildId);
    }

    // The formal panel submits one complete action; inventory, farm and save commit together.
    var farmActionIntensity = {
        plant:'medium', harvest:'medium', clear_crop:'medium', inject_facility:'medium', till:'high',
        feed_power:'low', set_jar_release:'low', set_venturi_concentration:'low',
        step_venturi_concentration:'low', step_jar_release:'low'
    };
    function tryAgricultureAction(actionId, params) {
        var action = String(actionId || '').trim();
        if (Object.hasOwn(farmActionIntensity, action)) return commitAgricultureAction(action, params);
        return applyAgricultureAction(action, params);
    }
    function performAgricultureAction(actionId, params) {
        if (!agriculturePanelOpen) return { ok: false, reason: 'panel_closed' };
        return commitAgricultureAction(String(actionId || '').trim(), params);
    }
    function commitAgricultureAction(actionId, params) {
        if (!window.SaveSystem || !window.SaveSystem.runAtomicFor) return { ok: false, reason: 'save_failed' };
        var checkpoint;
        try {
            checkpoint = window.SaveSystem.runAtomicFor('facility', function () {
                var result = applyAgricultureAction(actionId, params);
                if (!result || !result.ok) throw { agricultureActionRejected: true, result: result };
                var intensity = farmActionIntensity[actionId];
                if (intensity) {
                    var before = window.WorldTick.getWorldTotalTicks();
                    window.Survival.advanceTick({source:'agriculture', intensity:intensity});
                    if (window.WorldTick.getWorldTotalTicks() !== before + 1) throw {agricultureActionRejected:true, result:{ok:false, reason:'action_blocked'}};
                }
                return result;
            });
        } catch (error) {
            var current = AgricultureMap.getState();
            agricultureTaskMeta = current && current.task ? current.task.paymentMeta : null;
            updateAgriculturePanel();
            if (error && error.agricultureActionRejected) return error.result;
            throw error;
        }
        if (!checkpoint.saved) {
            var restored = AgricultureMap.getState();
            agricultureTaskMeta = restored && restored.task ? restored.task.paymentMeta : null;
            setAgricultureAutoTickEnabled(false);
        }
        SceneHud.refresh('status');
        updateAgriculturePanel();
        return checkpoint.saved ? checkpoint.value : { ok: false, reason: 'save_failed' };
    }

    function getAgricultureBatteries() {
        if (!IE) return [];
        var sources = [
            ['pocket', IE.getPocketArray()], ['vest', IE.getVestArray()], ['backpack', IE.getBackpackArray()]
        ];
        if (IE.getState().bound_vehicle_id) sources.push(['vehicle', IE.getVehicleArray()]);
        var rows = [];
        sources.forEach(function (source) {
            (source[1] || []).forEach(function (cell, index) {
                if (!cell || !cell.item_id || cell.item_id.indexOf('battery_') !== 0) return;
                var tpl = IE.getItemTemplate(cell.item_id);
                var stored = IE.getItemInstanceValue ? IE.getItemInstanceValue(cell, 'battery_charge') : cell.battery_charge;
                var amount = Number(stored != null ? stored : tpl && (tpl.battery_charge != null ? tpl.battery_charge : tpl.battery_capacity));
                if (!Number.isFinite(amount) || amount < 1) return;
                rows.push({ container: source[0], index: index, instanceId: cell.instance_id,
                    itemId: cell.item_id, name: displayNameForItemId(cell.item_id), charge: Math.floor(amount) });
            });
        });
        return rows;
    }

    function feedAgriculturePower(st, params) {
        if (!st.map.some(function (row) { return row.some(function (c) { return c.kind === 'super_fusion'; }); })) return { ok: false, reason: 'wrong_facility' };
        var battery = getAgricultureBatteries().find(function (row) {
            return row.container === params.container && row.index === params.index && row.itemId === params.itemId && row.instanceId === params.instanceId;
        });
        if (!battery) return { ok: false, reason: 'stale_item' };
        if (!Number.isFinite(st.power_charge + battery.charge)) return { ok: false, reason: 'invalid_amount' };
        var taken = IE.takeItemFromContainer(battery.container, battery.index);
        if (!taken || !taken.success) return { ok: false, reason: 'no_battery' };
        return AgricultureMap.addPowerCharge(st, battery.charge);
    }

    function isAgricultureAutoTickEnabled() {
        return !!(window.SceneCtx && window.SceneCtx.agriculture_auto_tick === true);
    }

    function setAgricultureAutoTickEnabled(enabled) {
        enabled = !!enabled && agriculturePanelOpen && !document.hidden && canUseOutdoorFacility('agriculture');
        if (window.SceneCtx) window.SceneCtx.agriculture_auto_tick = !!enabled;
        if (enabled) startAgricultureAutoTickIfNeeded();
        else stopAgricultureAutoTick();
        if (agriculturePanelOpen && window.AgriculturePanel && typeof window.AgriculturePanel.syncAutoTickToggle === 'function') {
            try { window.AgriculturePanel.syncAutoTickToggle(!!enabled); } catch (eSync) { /* ignore */ }
        }
    }

    function stopAgricultureAutoTick() {
        if (window.SceneCtx) window.SceneCtx.agriculture_auto_tick = false;
        if (!agricultureAutoTickTimer) return;
        try { clearInterval(agricultureAutoTickTimer); } catch (e0) { /* ignore */ }
        agricultureAutoTickTimer = null;
    }

    function startAgricultureAutoTickIfNeeded() {
        if (!isAgricultureAutoTickEnabled() || !agriculturePanelOpen) return;
        if (agricultureAutoTickTimer) return;
        agricultureAutoTickTimer = setInterval(onAgricultureAutoTick, 1000);
    }

    function afterAgricultureWorldTicksAdvanced() {
        var atomic = window.SaveSystem && window.SaveSystem.isAtomic();
        if (!atomic && typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        var Surv = window.Survival;
        var dead = !!(Surv && typeof Surv.isDead === 'function' && Surv.isDead());
        if (dead) {
            stopAgricultureAutoTick();
            if (agriculturePanelOpen) {
                closeAgriculturePanel();
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('agriculture.msg.tick_stopped_death'), 'warn');
            }
            if (window.SceneRenderer) window.SceneRenderer.render();
            return;
        }
        if (!atomic) updateAgriculturePanel();
    }

    function tickAgriculturePanelWorldOnce() {
        if (!agriculturePanelOpen) return { ok: false, reason: 'panel_closed' };
        if (!canUseOutdoorFacility('agriculture')) { closeAgriculturePanel({automatic:true}); return {ok:false,reason:'not_adjacent'}; }
        var Surv = window.Survival;
        if (!Surv || typeof Surv.advanceTick !== 'function') return { ok: false, reason: 'survival_missing' };
        if (typeof Surv.isDead === 'function' && Surv.isDead()) return { ok: false, reason: 'dead' };
        var beforeTick = window.WorldTick.getWorldTotalTicks();
        var task = AgricultureMap.getState().task;
        if (task && !task.paused) {
            Surv.advanceTick({source: 'agriculture_work', actionCost: getAgricultureConstructionCtx().staminaPerTick});
        } else {
            window.SceneMovement.waitInPlace();
        }
        var tickResult = { death: Surv.isDead() };
        afterAgricultureWorldTicksAdvanced();
        return {
            ok: window.WorldTick.getWorldTotalTicks() > beforeTick,
            tick: window.WorldTick.getWorldTotalTicks(),
            death: tickResult && tickResult.death ? tickResult.death : null
        };
    }

    function onAgricultureAutoTick() {
        if (!agriculturePanelOpen || !isAgricultureAutoTickEnabled()) {
            stopAgricultureAutoTick();
            return;
        }
        if (document.hidden) { setAgricultureAutoTickEnabled(false); return; }
        var r = performAgricultureAction('advance_ticks', { n: 1 });
        if (!r || !r.ok) {
            setAgricultureAutoTickEnabled(false);
            return;
        }
        if (r.death) stopAgricultureAutoTick();
    }

    function canUseOutdoorFacility(id) {
        if (!window.FacilityLabor || !window.FacilityLabor.nearby(id)) return false;
        if (window.Survival && window.Survival.isDead && window.Survival.isDead()) return false;
        if ((window.BedSleep && window.BedSleep.isActive()) || (window.GymSystem && window.GymSystem.isActive())) return false;
        if (window.CombatEngagement && window.CombatEngagement.isPlayerInCombat()) return false;
        return !window.SceneAccess.isPlayerActionDisabledByBuff(window.SceneAccess.ACTION_TYPES.NPC_INTERACT);
    }

    function syncOutdoorFacilityPanels() {
        if (agriculturePanelOpen && !canUseOutdoorFacility('agriculture')) closeAgriculturePanel({automatic:true});
        if (window.LivestockActions.livestockPanelOpen && !canUseOutdoorFacility('livestock')) window.LivestockActions.closeLivestockPanel();
    }

    function openAgriculturePanel() {
        if (!canUseOutdoorFacility('agriculture')) return;
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (window.SceneAccess.guardPlayerComaBlocked()) return;
        if (agriculturePanelOpen) return;
        if (window.FacilityLabor && !window.FacilityLabor.isUnlocked('agriculture')) {
            if (window.SceneApp.prepareFacilityLabor()) window.FacilityLaborPanel.open('agriculture');
            return;
        }
        unlockAgriculture();
        stopAgricultureAutoTick();
        CompostPanel.ensureLifePlantingSkillEntry();
        agriculturePanelOpen = true;
        var modal = document.getElementById('modal-agriculture');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        var st = AgricultureMap.getState();
        if (window.AgriculturePanel && typeof window.AgriculturePanel.render === 'function') {
            try { window.AgriculturePanel.render(st); } catch (eRender) { /* ignore */ }
        }
        if (window.AgriculturePanel && typeof window.AgriculturePanel.syncAutoTickToggle === 'function') {
            try { window.AgriculturePanel.syncAutoTickToggle(isAgricultureAutoTickEnabled()); } catch (eSync) { /* ignore */ }
        }
        startAgricultureAutoTickIfNeeded();
        window.SceneMapView.render();
    }

    function closeAgriculturePanel(options) {
        if (!agriculturePanelOpen) return;
        agriculturePanelOpen = false;
        stopAgricultureAutoTick();
        if (window.AgriculturePanel && window.AgriculturePanel.close) window.AgriculturePanel.close();
        SceneUi.hideItemTooltip();
        var modal = document.getElementById('modal-agriculture');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        window.SceneMapView.render();
    }

    function updateAgriculturePanel() {
        if (!agriculturePanelOpen) return;
        var st = AgricultureMap.ensureState();
        if (window.AgriculturePanel && typeof window.AgriculturePanel.update === 'function') {
            try { window.AgriculturePanel.update(st); } catch (eUpAg) { /* ignore */ }
        }
    }

    function displayNameForItemId(itemId) {
        var id = String(itemId || '').trim();
        if (!id) return '';
        if (IE && typeof IE.getItemTemplate === 'function') {
            var tpl = IE.getItemTemplate(id);
            var char = window.SceneCtx && window.SceneCtx.character;
            if (tpl && typeof IE.getDisplayName === 'function') {
                return String(IE.getDisplayName(tpl, null, char) || tpl.sn || id);
            }
            if (tpl && tpl.sn) return String(tpl.sn);
        }
        return id;
    }

    function getAgriculturePlantOptions() {
        var API = window.AgriculturePlayerItems;
        if (!API || typeof API.listSeeds !== 'function') return [];
        var rows = API.listSeeds();
        var seen = {};
        var out = [];
        var i;
        for (i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || !row.item_id) continue;
            var def = findCropDefBySeedItemId(row.item_id);
            if (!def || !def.cropId) continue;
            var key = def.cropId + '|' + row.item_id;
            if (seen[key]) continue;
            seen[key] = true;
            out.push({
                seedItemId: row.item_id,
                cropId: def.cropId,
                name: displayNameForItemId(row.item_id),
                count: API.countItemId(row.item_id)
            });
        }
        out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh'); });
        return out;
    }

    function getAgricultureSoilAmendmentOptions() {
        var API = window.AgriculturePlayerItems;
        if (!API || typeof API.listSoilAmendments !== 'function') return [];
        var rows = API.listSoilAmendments();
        var out = [];
        var seen = {};
        var i;
        for (i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || !row.item_id) continue;
            if (seen[row.item_id]) continue;
            seen[row.item_id] = true;
            out.push({
                itemId: row.item_id,
                name: displayNameForItemId(row.item_id),
                count: API.countItemId(row.item_id)
            });
        }
        return out;
    }

    function getAgricultureInjectables(facilityKind) {
        var API = window.AgriculturePlayerItems;
        var kind = String(facilityKind || '').trim();
        var rows = [];
        if (!API) return rows;
        if (kind === 'venturi_fertilizer' && typeof API.listVenturiInjectables === 'function') {
            rows = API.listVenturiInjectables();
        } else if (kind === 'buried_pot_jar' && typeof API.listJarInjectables === 'function') {
            rows = API.listJarInjectables();
        }
        var out = [];
        var seen = {};
        var i;
        for (i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || !row.item_id) continue;
            if (seen[row.item_id]) continue;
            seen[row.item_id] = true;
            out.push({
                itemId: row.item_id,
                name: displayNameForItemId(row.item_id),
                count: API.countItemId(row.item_id)
            });
        }
        return out;
    }
    function getAgricultureMapState() {
        var A = window.AgricultureMap;
        return (A && typeof A.cloneState === 'function') ? A.cloneState(A.getState()) : null;
    }

    function getAgricultureMapStateMutable() {
        var A = window.AgricultureMap;
        return (A && typeof A.getState === 'function') ? A.getState() : null;
    }

    function setAgricultureMapState(s) {
        var A = window.AgricultureMap;
        if (A && typeof A.setState === 'function') A.setState(s);
    }

    function initialize() {
        PLANTING_SKILL_ID = 'life_planting';
        agriculturePanelOpen = false;
        agricultureAutoTickTimer = null;
        agricultureCropDefsDoc = null;
        agricultureSoilsDoc = null;
        agricultureTaskMeta = null;
        AGRICULTURE_BUILD_TASK_BY_ID = {
        channel_dig: 'build',
        channel_remove: 'remove',
        channel_upgrade: 'upgrade',
        channel_downgrade: 'downgrade',
        land_reclaim: 'till',
        land_remove_reclaim: 'remove_tilled',
        venturi_fertilizer: 'build_venturi',
        venturi_fertilizer_remove: 'remove_venturi',
        buried_pot_jar: 'build_buried_pot_jar',
        buried_pot_jar_remove: 'remove_buried_pot_jar',
        super_fusion: 'build_super_fusion',
        super_fusion_remove: 'remove_super_fusion',
        crop_structure_remove: 'remove_crop_structure'
    };
    }

    function bind() {

    (function bindAgriculturePanelCloseOnce() {
        var closeBtn = document.getElementById('agriculture-panel-close');
        if (closeBtn && !closeBtn.__agriBound) {
            closeBtn.__agriBound = true;
            closeBtn.addEventListener('click', closeAgriculturePanel);
        }
    })();
    }

    window.AgricultureActions = {
        initialize: initialize,
        bind: bind,
        get agricultureCropDefsDoc() { return agricultureCropDefsDoc; },
        set agricultureCropDefsDoc(value) { agricultureCropDefsDoc = value; },
        get agricultureSoilsDoc() { return agricultureSoilsDoc; },
        set agricultureSoilsDoc(value) { agricultureSoilsDoc = value; },
        buildAgricultureEnv: buildAgricultureEnv,
        canUseOutdoorFacility: canUseOutdoorFacility,
        closeAgriculturePanel: closeAgriculturePanel,
        getAgricultureInjectables: getAgricultureInjectables,
        getAgricultureBatteries: getAgricultureBatteries,
        getAgricultureMapState: getAgricultureMapState,
        getAgricultureMapStateMutable: getAgricultureMapStateMutable,
        getAgriculturePlantOptions: getAgriculturePlantOptions,
        getAgricultureSoilAmendmentOptions: getAgricultureSoilAmendmentOptions,
        isAgricultureAutoTickEnabled: isAgricultureAutoTickEnabled,
        isAgricultureUnlocked: isAgricultureUnlocked,
        openAgriculturePanel: openAgriculturePanel,
        payAgricultureBuildCost: payAgricultureBuildCost,
        performAgricultureAction: performAgricultureAction,
        setAgricultureAutoTickEnabled: setAgricultureAutoTickEnabled,
        setAgricultureMapState: setAgricultureMapState,
        stopAgricultureAutoTick: stopAgricultureAutoTick,
        syncOutdoorFacilityPanels: syncOutdoorFacilityPanels,
        tickAgricultureAfterWorldTick: tickAgricultureAfterWorldTick,
        tryAgricultureAction: tryAgricultureAction,
        unlockAgriculture: unlockAgriculture,
        updateAgriculturePanel: updateAgriculturePanel
    };
})(window);
