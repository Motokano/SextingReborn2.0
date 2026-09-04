/**
 * PharmacyStation — 制药站点模块（scene-app 组合根化拆解 P1b）
 *
 * 来源与分工：
 * - config 所有权自 js/scene-app.js 迁出（原闭包变量 pharmacyMethods/pharmacyRecipes/
 *   pharmacyFailureItemId，由 loadConfig 装载）。loadConfig 现调用
 *   PharmacyStation.setConfig(cfg)。
 * - 站点运行时状态仍存于 window.SceneCtx.pharmacy_station_runtime
 *   （save-system 直接读 SceneCtx 持久化，契约不变）；本模块后续（P1b-2+）搬入触碰
 *   这些字段的逻辑函数时再提供 getState/setState/advanceWorldTicks。
 *
 * 装载来源表：methods=data/recipe-methods.json、recipes=data/recipes.json（统一配方表），
 * failureItemId 默认 'food_pharmacy_fail_generic'。
 */
(function (global) {
    'use strict';

    var cfg = {
        methods: {},
        recipes: [],
        failure_item_id: 'food_pharmacy_fail_generic'
    };

    /** 装载站点配置（幂等；loadConfig 调用）。对象/数组按引用保存，与旧闭包语义一致。 */
    function setConfig(c) {
        if (!c || typeof c !== 'object') return;
        if (c.methods && typeof c.methods === 'object') cfg.methods = c.methods;
        if (Array.isArray(c.recipes)) cfg.recipes = c.recipes;
        if (c.failureItemId && typeof c.failureItemId === 'string') {
            cfg.failure_item_id = c.failureItemId;
        }
    }

    function getMethods() { return cfg.methods; }
    function getRecipes() { return cfg.recipes; }
    function getFailureItemId() { return cfg.failure_item_id; }

    /** 统一配方系统 id（RecipeSystem/recipe-schema 对齐；原 scene-app 闭包 PHARMACY_RECIPE_SYSTEM）。 */
    var RECIPE_SYSTEM_ID = 'life_pharmacy';

    /**
     * 标记制药配方已学：写 SceneCtx 图鉴（迁移期双写 known_pharmacy_recipes 与
     * known_recipe_ids_by_system[RECIPE_SYSTEM_ID]）。
     */
    function markRecipeKnown(recipeId) {
        if (!recipeId || !global.SceneCtx) return;
        global.SceneCtx.known_pharmacy_recipes = global.SceneCtx.known_pharmacy_recipes || {};
        var rid = String(recipeId);
        global.SceneCtx.known_pharmacy_recipes[rid] = true;
        global.SceneCtx.known_recipe_ids_by_system = global.SceneCtx.known_recipe_ids_by_system || {};
        if (!global.SceneCtx.known_recipe_ids_by_system[RECIPE_SYSTEM_ID]) {
            global.SceneCtx.known_recipe_ids_by_system[RECIPE_SYSTEM_ID] = {};
        }
        global.SceneCtx.known_recipe_ids_by_system[RECIPE_SYSTEM_ID][rid] = true;
    }

    /** 新档默认装配配件（当前为空表）。面板侧旧闭包 DEFAULT_PHARMACY_INSTALLED_ACCESSORIES 随 P1c-2 面板迁出后同源。 */
    var DEFAULT_ACCESSORY_IDS = [];

    /** 创建默认站点运行时状态（新档/重置用）。 */
    function createDefaultState() {
        return {
            fuel_points: 0,
            water_points: 0,
            water_unlimited: false,
            installed_accessory_item_ids: DEFAULT_ACCESSORY_IDS.slice(),
            active_craft: null
        };
    }

    /**
     * 获取站点运行时状态：SceneCtx.pharmacy_station_runtime 懒初始化 + 字段归一化。
     * 原 scene-app getPharmacyStationState 逐字迁移（含无 SceneCtx 时的静态兜底对象）。
     */
    function getState() {
        if (!global.SceneCtx) {
            return {
                fuel_points: 0,
                water_points: 0,
                water_unlimited: false,
                installed_accessory_item_ids: DEFAULT_ACCESSORY_IDS.slice()
            };
        }
        if (!global.SceneCtx.pharmacy_station_runtime || typeof global.SceneCtx.pharmacy_station_runtime !== 'object') {
            global.SceneCtx.pharmacy_station_runtime = createDefaultState();
        }
        var s = global.SceneCtx.pharmacy_station_runtime;
        if (!isFinite(parseInt(s.fuel_points, 10))) s.fuel_points = 0;
        if (!isFinite(parseInt(s.water_points, 10))) s.water_points = 0;
        s.water_unlimited = s.water_unlimited === true || s.water_unlimited === 'true' || s.water_unlimited === 1 || String(s.water_unlimited).toLowerCase() === '1';
        if (!Array.isArray(s.installed_accessory_item_ids)) s.installed_accessory_item_ids = DEFAULT_ACCESSORY_IDS.slice();
        if (s.active_craft != null && typeof s.active_craft !== 'object') s.active_craft = null;
        return s;
    }

    /**
     * UI 依赖注入（P1c-2 起；见 cooking-station.js setUiDeps 说明）。
     */
    var uiDeps = {};
    function setUiDeps(deps) {
        if (deps && typeof deps === 'object') uiDeps = Object.assign({}, uiDeps, deps);
    }
    function ui(key, vars) {
        return (typeof uiDeps.ui === 'function') ? uiDeps.ui(key, vars) : (key != null ? String(key) : '');
    }
    function showMsg(text, kind) {
        if (typeof uiDeps.showMsg === 'function') uiDeps.showMsg(text, kind);
    }

    /** 触发统一配方处理器注册（依赖注入；对应 scene-app registerPharmacyRecipeProcessorIfNeeded）。 */
    function registerPharmacyProcessor() {
        if (typeof uiDeps.registerPharmacyProcessor === 'function') uiDeps.registerPharmacyProcessor();
    }

    /** 统一配方路由解析：走 RecipeSystem.craft（原 scene-app tryResolvePharmacyByUnifiedRoute 逐字迁移）。 */
    function tryResolvePharmacyByUnifiedRoute(methodId, selectedInputs) {
        if (!global.RecipeSystem || typeof global.RecipeSystem.craft !== 'function') {
            return { ok: false, reason: 'recipe_system_unavailable' };
        }
        registerPharmacyProcessor();
        var ret = global.RecipeSystem.craft({
            recipe_system: RECIPE_SYSTEM_ID,
            method_id: StationCraftCore.toUnifiedPharmacyMethodId(methodId),
            inputs: Array.isArray(selectedInputs) ? selectedInputs : []
        });
        if (!ret || ret.ok !== true) {
            return {
                ok: false,
                reason: 'recipe_system_craft_failed',
                error: ret && ret.error ? ret.error : null
            };
        }
        var data = ret.result && typeof ret.result === 'object' ? ret.result : {};
        return { ok: true, data: data };
    }

    /** 制药方法显示名（name 字段优先，否则 UIText pharmacy.method.<id> 兜底；原 scene-app 逐字迁移）。 */
    function getPharmacyMethodDisplayName(methodId, methodObj) {
        var mid = methodId != null ? String(methodId) : '';
        var m = methodObj && typeof methodObj === 'object' ? methodObj : {};
        if (m.name != null && String(m.name).trim() !== '') return String(m.name);
        var keyRaw = mid.indexOf('life_pharmacy.') === 0 ? mid.slice('life_pharmacy.'.length) : mid;
        var key = 'pharmacy.method.' + keyRaw;
        try {
            if (global.UIText && typeof global.UIText.t === 'function') {
                return global.UIText.t(key);
            }
        } catch (e0) { /* fallback */ }
        return mid;
    }

    var E = global.GameEngine;
    var IE = global.InventoryEquipment;

    /** 停 idle 计时器（依赖注入；对应 scene-app stopPharmacyCraftIdle）。 */
    function stopCraftIdle() {
        if (typeof uiDeps.stopPharmacyIdle === 'function') uiDeps.stopPharmacyIdle();
    }
    /** 面板刷新钩子（依赖注入；对应 scene-app「open 时 renderPharmacyStationPanel」）。 */
    function refreshPharmacyPanel() {
        if (typeof uiDeps.refreshPharmacyPanel === 'function') uiDeps.refreshPharmacyPanel();
    }

    /** 当前进行中的制作（remaining_ticks>0 才有效；浅拷贝返回）。 */
    function getActiveCraft() {
        var cs = getState();
        var ac = cs && cs.active_craft && typeof cs.active_craft === 'object' ? cs.active_craft : null;
        if (!ac) return null;
        var rt = Math.max(0, Math.floor(Number(ac.remaining_ticks) || 0));
        if (!(rt > 0)) return null;
        return Object.assign({}, ac, { remaining_ticks: rt });
    }

    function clearActiveCraft() {
        var cs = getState();
        if (cs) cs.active_craft = null;
    }

    /** 制药制作结算（原 scene-app finalizePharmacyCraftNow 迁出；行为零变）。 */
    function finalizeCraftNow(craftSnap, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var craft = craftSnap && typeof craftSnap === 'object' ? craftSnap : getActiveCraft();
        clearActiveCraft();
        stopCraftIdle();

        if (!craft || !craft.method_id) return;
        var mid = String(craft.method_id).trim();
        var m = PharmacyStation.getMethods() && PharmacyStation.getMethods()[mid] ? PharmacyStation.getMethods()[mid] : null;
        var failId = PharmacyStation.getFailureItemId();
        var forceFailure = !!opts.force_failure;
        var selected = StationCraftCore.normalizePharmacyInputs(craft.inputs || []);
        var matched = StationCraftCore.matchPharmacyRecipesByInputs(selected, mid);

        function grantItemOrDrop(itemId) {
            var outInst = { item_id: itemId, count: 1 };
            var placed = IE.putItemIntoDefaultContainer(outInst);
            if (!placed || !placed.placed) {
                var st0 = E.getState();
                if (typeof IE.addItemToGround === 'function') IE.addItemToGround(st0.mapId, st0.x, st0.y, outInst);
            }
        }

        if (forceFailure) {
            grantItemOrDrop(failId);
            showMsg(ui('pharmacy.msg.done_fail', { item: failId }), 'warn');
            SceneHud.refresh('backpack');
            SceneHud.refresh('status');
            if (global.SceneRenderer) global.SceneRenderer.render();
            return;
        }

        var pick = null;
        var pickRecipeId = '';
        var pickBaseSuccessRate = null;
        var pickMainOutput = null;
        var pickBonusOutputs = [];
        var pickFailureOutput = null;
        var unifiedRet = tryResolvePharmacyByUnifiedRoute(mid, selected);
        if (unifiedRet.ok && unifiedRet.data) {
            var routeData = unifiedRet.data;
            pickRecipeId = routeData.selected_recipe_id || '';
            pickMainOutput = routeData.main_output && typeof routeData.main_output === 'object' ? routeData.main_output : null;
            pickBonusOutputs = Array.isArray(routeData.bonus_outputs) ? routeData.bonus_outputs : [];
            pickFailureOutput = routeData.failure_output && typeof routeData.failure_output === 'object' ? routeData.failure_output : null;
            pickBaseSuccessRate = routeData.base_success_rate;
            if (pickMainOutput && pickMainOutput.item_id) {
                pick = {
                    output_item_id: String(pickMainOutput.item_id),
                    recipe_id: pickRecipeId,
                    bonus_outputs: pickBonusOutputs,
                    failure_output: pickFailureOutput
                };
            }
        } else if (unifiedRet.error && unifiedRet.error.code !== 'RECIPE_NO_MATCHED_RECIPE') {
            try { console.warn('[Pharmacy][UnifiedRoute] craft failed:', unifiedRet.error); } catch (eLog0) { /* ignore */ }
        }
        if (!pick) {
            if (!matched.length) {
                grantItemOrDrop(failId);
                showMsg(ui('pharmacy.msg.no_recipe_fail', { item: failId }), 'warn');
                SceneHud.refresh('backpack');
                SceneHud.refresh('status');
                if (global.SceneRenderer) global.SceneRenderer.render();
                return;
            }
            pick = StationCraftCore.pickPharmacyRecipeWeighted(matched);
            if (!pick) {
                grantItemOrDrop(failId);
                showMsg(ui('pharmacy.msg.done_fail', { item: failId }), 'warn');
                SceneHud.refresh('backpack');
                SceneHud.refresh('status');
                if (global.SceneRenderer) global.SceneRenderer.render();
                return;
            }
            pickRecipeId = pick.recipe_id ? String(pick.recipe_id) : '';
            pickBaseSuccessRate = pick.base_success_rate != null ? pick.base_success_rate : (m ? m.base_success_rate : 1);
        }

        var pq = global.ProductionQuality;
        var evalRes = (pq && typeof pq.evaluateProduction === 'function')
            ? pq.evaluateProduction({
                base_success_rate: pickBaseSuccessRate != null ? pickBaseSuccessRate : (m ? m.base_success_rate : 1),
                skill_level: 0,
                input_items: Array.isArray(craft.consumed_items) ? craft.consumed_items.slice() : []
            })
            : { success: true, success_rate: 1 };
        var pharmacySuccessRaw = Math.max(0, Number(evalRes.success_rate) || 0);
        var pharmacySuccessFinal = StationCraftCore.getProductionSuccessRateWithMoodDelta(pharmacySuccessRaw);
        evalRes.success_rate = pharmacySuccessFinal;
        evalRes.success = Math.random() < pharmacySuccessFinal;
        var outputItemId = failId;
        if (evalRes.success) {
            if (pickMainOutput && pickMainOutput.item_id) outputItemId = String(pickMainOutput.item_id);
            else outputItemId = pick.output_item_id;
        } else if (pickFailureOutput && pickFailureOutput.item_id) {
            outputItemId = String(pickFailureOutput.item_id);
        } else if (pick && pick.failure_output && pick.failure_output.item_id) {
            outputItemId = String(pick.failure_output.item_id);
        }
        if (evalRes.success && pickRecipeId) markRecipeKnown(pickRecipeId);

        grantItemOrDrop(outputItemId);
        if (evalRes.success && Array.isArray(pickBonusOutputs) && pickBonusOutputs.length) {
            var bi;
            for (bi = 0; bi < pickBonusOutputs.length; bi++) {
                var brow = pickBonusOutputs[bi] || {};
                var bid = brow.item_id != null ? String(brow.item_id) : '';
                var bcnt = Math.max(1, parseInt(brow.count, 10) || 1);
                var bchance = Number(brow.chance);
                if (!bid) continue;
                if (!(bchance >= 0)) bchance = 1;
                bchance = Math.max(0, Math.min(1, bchance));
                if (Math.random() >= bchance) continue;
                var bk;
                for (bk = 0; bk < bcnt; bk++) grantItemOrDrop(bid);
            }
        }
        showMsg(
            evalRes.success
                ? ui('pharmacy.msg.done_ok', { item: outputItemId, method: mid })
                : ui('pharmacy.msg.done_fail', { item: failId }),
            evalRes.success ? 'success' : 'warn'
        );
        SceneHud.refresh('backpack');
        SceneHud.refresh('status');
        if (global.SceneRenderer) global.SceneRenderer.render();
    }

    /** 世界 tick 推进制作（remaining_ticks -1，到点 finalize；原 scene-app tickPharmacyCraftAfterWorldTick）。 */
    function tickCraftAfterWorldTick() {
        var cs = getState();
        if (!cs || !cs.active_craft || typeof cs.active_craft !== 'object') return;
        var rt = Math.max(0, Math.floor(Number(cs.active_craft.remaining_ticks) || 0));
        if (!(rt > 0)) {
            cs.active_craft = null;
            stopCraftIdle();
            return;
        }
        rt -= 1;
        cs.active_craft.remaining_ticks = rt;
        if (rt <= 0) {
            finalizeCraftNow(cs.active_craft);
        }
        refreshPharmacyPanel();
    }

    /** 当前站点上下文（依赖注入；对应 scene-app getCurrentPharmacyStationContext）。 */
    function getCurrentStationContext() {
        return (typeof uiDeps.getCurrentPharmacyStationContext === 'function') ? uiDeps.getCurrentPharmacyStationContext() : null;
    }

    /** 从工艺表中收集需要的配件 id（去重排序）。 */
    function getPharmacyAccessoryItemIdsFromMethods() {
        var out = [];
        var seen = {};
        if (!getMethods() || typeof getMethods() !== 'object') return out;
        var ids = Object.keys(getMethods());
        var i;
        for (i = 0; i < ids.length; i++) {
            var m = getMethods()[ids[i]] || {};
            var aid = (m.requires_accessory_item_id != null) ? String(m.requires_accessory_item_id).trim() : '';
            if (!aid || seen[aid]) continue;
            seen[aid] = true;
            out.push(aid);
        }
        out.sort();
        return out;
    }

    /** 背包中可安装的配件候选（未安装且数量>0）。 */
    function getPharmacyAccessoryOptionsFromInventory(installedIds) {
        var allow = getPharmacyAccessoryItemIdsFromMethods();
        if (!allow.length) return [];
        var installedSet = {};
        var i;
        for (i = 0; i < (installedIds || []).length; i++) installedSet[String(installedIds[i])] = true;
        var out = [];
        for (i = 0; i < allow.length; i++) {
            var id = allow[i];
            var have = global.InventoryHelpers.getInventoryCountByItemId(id);
            if (have <= 0) continue;
            if (installedSet[id]) continue;
            out.push({ item_id: id, count: have });
        }
        return out;
    }

    /** 从背包安装配件（校验合法性 → 取出 → 写入 state.installed_accessory_item_ids）。 */
    function installPharmacyAccessoryFromInventory(itemId) {
        var id = itemId != null ? String(itemId).trim() : '';
        if (!id) return { ok: false, reason: 'bad_item' };
        var allow = getPharmacyAccessoryItemIdsFromMethods();
        if (allow.indexOf(id) < 0) return { ok: false, reason: 'not_pharmacy_accessory', item_id: id };
        var cs = getState();
        var arr = Array.isArray(cs.installed_accessory_item_ids) ? cs.installed_accessory_item_ids : [];
        var i;
        for (i = 0; i < arr.length; i++) {
            if (String(arr[i]) === id) return { ok: false, reason: 'already_installed', item_id: id };
        }
        var slot = global.InventoryHelpers.findFirstContainerSlotByItemId(id);
        if (!slot) return { ok: false, reason: 'missing_item', item_id: id };
        if (!IE || typeof IE.takeItemFromContainer !== 'function') return { ok: false, reason: 'inventory_api_missing' };
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        if (!taken || !taken.success || !taken.item) return { ok: false, reason: 'take_failed', item_id: id };
        arr.push(id);
        cs.installed_accessory_item_ids = arr;
        return { ok: true, item_id: id };
    }

    /** 卸载配件回背包（默认容器满则掉到脚下地面）。 */
    function uninstallPharmacyAccessoryToInventory(itemId) {
        var id = itemId != null ? String(itemId).trim() : '';
        if (!id) return { ok: false, reason: 'bad_item' };
        var cs = getState();
        var src = Array.isArray(cs.installed_accessory_item_ids) ? cs.installed_accessory_item_ids : [];
        var out = [];
        var removed = false;
        var i;
        for (i = 0; i < src.length; i++) {
            var cur = String(src[i]).trim();
            if (!removed && cur === id) {
                removed = true;
                continue;
            }
            if (cur) out.push(cur);
        }
        if (!removed) return { ok: false, reason: 'not_installed', item_id: id };
        if (!IE || typeof IE.putItemIntoDefaultContainer !== 'function') return { ok: false, reason: 'inventory_api_missing' };
        var inst = { item_id: id, count: 1 };
        var placed = IE.putItemIntoDefaultContainer(inst);
        if (!placed || !placed.placed) {
            var st = E && typeof E.getState === 'function' ? E.getState() : null;
            if (st && typeof IE.addItemToGround === 'function') {
                IE.addItemToGround(st.mapId, st.x, st.y, inst);
            } else {
                return { ok: false, reason: 'put_back_failed', item_id: id };
            }
        }
        cs.installed_accessory_item_ids = out;
        return { ok: true, item_id: id };
    }

    /** 方法是否在该站点解锁（临时灶台按 allowed_methods/配件校验；常驻站按 state 配件）。 */
    function isPharmacyMethodUnlockedAtStation(methodId, stationContext) {
        var m = getMethods() && methodId ? getMethods()[String(methodId)] : null;
        if (!m) return false;
        var ctx = stationContext || getCurrentStationContext();
        if (ctx && ctx.station_type === 'temp') {
            var allowed = ctx.temp_station && Array.isArray(ctx.temp_station.allowed_methods) ? ctx.temp_station.allowed_methods : null;
            if (allowed && allowed.length) {
                var mid0 = String(methodId);
                var allowHit = false;
                var ai;
                for (ai = 0; ai < allowed.length; ai++) {
                    if (String(allowed[ai]) === mid0) { allowHit = true; break; }
                }
                if (!allowHit) return false;
            }
        }
        var req = m.requires_accessory_item_id;
        if (req == null || String(req).trim() === '') return true;
        var arr;
        if (ctx && ctx.station_type === 'temp') {
            arr = ctx.temp_station && Array.isArray(ctx.temp_station.installed_accessory_item_ids)
                ? ctx.temp_station.installed_accessory_item_ids
                : [];
        } else {
            var st = getState();
            arr = st.installed_accessory_item_ids || [];
        }
        var need = String(req).trim();
        var i;
        for (i = 0; i < arr.length; i++) {
            if (String(arr[i]).trim() === need) return true;
        }
        return false;
    }

    global.PharmacyStation = {
        setConfig: setConfig,
        getMethods: getMethods,
        getRecipes: getRecipes,
        getFailureItemId: getFailureItemId,
        recipeSystemId: RECIPE_SYSTEM_ID,
        markRecipeKnown: markRecipeKnown,
        createDefaultState: createDefaultState,
        getState: getState,
        setUiDeps: setUiDeps,
        ui: ui,
        showMsg: showMsg,
        tryResolvePharmacyByUnifiedRoute: tryResolvePharmacyByUnifiedRoute,
        getPharmacyMethodDisplayName: getPharmacyMethodDisplayName,
        getActiveCraft: getActiveCraft,
        clearActiveCraft: clearActiveCraft,
        finalizeCraftNow: finalizeCraftNow,
        tickCraftAfterWorldTick: tickCraftAfterWorldTick,
        getPharmacyAccessoryItemIdsFromMethods: getPharmacyAccessoryItemIdsFromMethods,
        getPharmacyAccessoryOptionsFromInventory: getPharmacyAccessoryOptionsFromInventory,
        installPharmacyAccessoryFromInventory: installPharmacyAccessoryFromInventory,
        uninstallPharmacyAccessoryToInventory: uninstallPharmacyAccessoryToInventory,
        isPharmacyMethodUnlockedAtStation: isPharmacyMethodUnlockedAtStation
    };
})(typeof window !== 'undefined' ? window : globalThis);
