/**
 * CookingStation — 烹饪站点模块（scene-app 组合根化拆解 P1b）
 *
 * 来源与分工：
 * - config 所有权自 js/scene-app.js 迁出（原闭包变量 cookingMethods/cookingRecipes/
 *   cookingFailureItemId/cookingTempStationLifetimeTicks，由 loadConfig 装载）。
 *   loadConfig 现调用 CookingStation.setConfig(cfg)（对齐 EnemyDrops.setConfig 惯例）。
 * - 站点运行时状态仍存于 window.SceneCtx.cooking_station_runtime / cooking_temp_stations_runtime
 *   （save-system 直接读 SceneCtx 持久化，契约不变）；本模块后续（P1b-2+）搬入触碰这些
 *   字段的逻辑函数时再提供 getState/setState/advanceWorldTicks。
 *
 * 装载来源表：methods=data/cooking-methods.json、recipes=data/cooking-recipes.json、
 * failureItemId 与 tempStationLifetimeTicks 由 data/cooking-system-config.csv 注入
 * （经 parseCookingSystemConfigCsv 解析后传入，可改 id 后 item-editor 维护物品模板）。
 */
(function (global) {
    'use strict';

    var cfg = {
        methods: {},
        recipes: [],
        failure_item_id: 'food_cooking_fail_generic',
        temp_station_lifetime_ticks: 50
    };

    /** 装载站点配置（幂等；loadConfig 调用）。对象/数组按引用保存，与旧闭包语义一致。 */
    function setConfig(c) {
        if (!c || typeof c !== 'object') return;
        if (c.methods && typeof c.methods === 'object') cfg.methods = c.methods;
        if (Array.isArray(c.recipes)) cfg.recipes = c.recipes;
        if (c.failureItemId && typeof c.failureItemId === 'string') {
            cfg.failure_item_id = c.failureItemId;
        }
        var ttl = parseInt(c.tempStationLifetimeTicks, 10);
        if (isFinite(ttl) && ttl > 0) cfg.temp_station_lifetime_ticks = ttl;
    }

    function getMethods() { return cfg.methods; }
    function getRecipes() { return cfg.recipes; }
    function getFailureItemId() { return cfg.failure_item_id; }
    function getTempStationLifetimeTicks() { return cfg.temp_station_lifetime_ticks; }

    /** 统一配方系统 id（RecipeSystem/recipe-schema 对齐；原 scene-app 闭包 COOKING_RECIPE_SYSTEM）。 */
    var RECIPE_SYSTEM_ID = 'life_cooking';

    /**
     * 标记烹饪配方已学：写 SceneCtx 图鉴（迁移期双写 known_cooking_recipes 与
     * known_recipe_ids_by_system[RECIPE_SYSTEM_ID]；save-system deriveKnownCookingRecipeIds 读取）。
     */
    function markRecipeKnown(recipeId) {
        if (!recipeId || !global.SceneCtx) return;
        global.SceneCtx.known_cooking_recipes = global.SceneCtx.known_cooking_recipes || {};
        var rid = String(recipeId);
        global.SceneCtx.known_cooking_recipes[rid] = true;
        global.SceneCtx.known_recipe_ids_by_system = global.SceneCtx.known_recipe_ids_by_system || {};
        if (!global.SceneCtx.known_recipe_ids_by_system[RECIPE_SYSTEM_ID]) {
            global.SceneCtx.known_recipe_ids_by_system[RECIPE_SYSTEM_ID] = {};
        }
        global.SceneCtx.known_recipe_ids_by_system[RECIPE_SYSTEM_ID][rid] = true;
    }

    /** 新档默认装配配件（当前为空表）。面板侧旧闭包 DEFAULT_COOKING_INSTALLED_ACCESSORIES 随 P1c-2 面板迁出后同源。 */
    var DEFAULT_ACCESSORY_IDS = [];

    /** 创建默认站点运行时状态（新档/重置用；语义同原 resetCookingStateForNewCharacter）。 */
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
     * 获取站点运行时状态：SceneCtx.cooking_station_runtime 懒初始化 + 字段归一化。
     * 原 scene-app getCookingStationState 逐字迁移（含无 SceneCtx 时的静态兜底对象）。
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
        if (!global.SceneCtx.cooking_station_runtime || typeof global.SceneCtx.cooking_station_runtime !== 'object') {
            global.SceneCtx.cooking_station_runtime = createDefaultState();
        }
        var s = global.SceneCtx.cooking_station_runtime;
        if (!isFinite(parseInt(s.fuel_points, 10))) s.fuel_points = 0;
        if (!isFinite(parseInt(s.water_points, 10))) s.water_points = 0;
        s.water_unlimited = s.water_unlimited === true || s.water_unlimited === 'true' || s.water_unlimited === 1 || String(s.water_unlimited).toLowerCase() === '1';
        if (!Array.isArray(s.installed_accessory_item_ids)) s.installed_accessory_item_ids = DEFAULT_ACCESSORY_IDS.slice();
        if (s.active_craft != null && typeof s.active_craft !== 'object') s.active_craft = null;
        return s;
    }

    /**
     * UI 依赖注入（P1c-2 起，搬入的制作/面板逻辑经 deps 调用主 JS 的闭包 infra，
     * 避免把 ui/showMsg/render 等塞进 window）。由 scene-app init 注入一次。
     * deps 可用键：ui / showMsg / render / getItemDisplayNameSafe / markCellDirty
     *           / updateBackpackPanel / updateStatusPanel（渐次补充）。
     */
    var uiDeps = {};
    function setUiDeps(deps) {
        if (deps && typeof deps === 'object') uiDeps = Object.assign({}, uiDeps, deps);
    }
    function getUiDeps() { return uiDeps; }
    function ui(key, vars) {
        return (typeof uiDeps.ui === 'function') ? uiDeps.ui(key, vars) : (key != null ? String(key) : '');
    }
    function showMsg(text, kind) {
        if (typeof uiDeps.showMsg === 'function') uiDeps.showMsg(text, kind);
    }

    /** 触发统一配方处理器注册（依赖注入；对应 scene-app registerCookingRecipeProcessorIfNeeded）。 */
    function registerCookingProcessor() {
        if (typeof uiDeps.registerCookingProcessor === 'function') uiDeps.registerCookingProcessor();
    }

    /** 统一配方路由解析：走 RecipeSystem.craft（原 scene-app tryResolveCookingByUnifiedRoute 逐字迁移）。 */
    function tryResolveCookingByUnifiedRoute(methodId, selectedInputs) {
        if (!global.RecipeSystem || typeof global.RecipeSystem.craft !== 'function') {
            return { ok: false, reason: 'recipe_system_unavailable' };
        }
        registerCookingProcessor();
        var ret = global.RecipeSystem.craft({
            recipe_system: RECIPE_SYSTEM_ID,
            method_id: StationCraftCore.toUnifiedCookingMethodId(methodId),
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

    /** 烹饪生活技能成长曲线常量（自 scene-app 闭包迁出；对齐生活技能：500 万次使用满级 100）。 */
    var COOKING_SKILL_MAX_LEVEL = 100;
    var COOKING_MAX_PROFICIENCY_USES = 5000000;
    var COOKING_SUCCESS_BONUS_PER_LEVEL = 0.005;

    function getIE() {
        return global.InventoryEquipment || null;
    }

    /** 读当前烹饪技能等级（life_cooking；skill_id 与 recipe-system 对齐）。 */
    function getCookingSkillLevel() {
        var IE = getIE();
        if (IE && typeof IE.getSkillLevel === 'function') {
            var lv = parseInt(IE.getSkillLevel('life_cooking'), 10);
            if (isFinite(lv) && lv > 0) return lv;
        }
        return 0;
    }

    /** 按累计成功次数映射技能等级（5000000 次达到满级 100）。 */
    function getCookingLevelBySuccessUses(successUses) {
        var uses = Math.max(0, parseInt(successUses, 10) || 0);
        // 对齐生活技能：以累计使用次数驱动成长，5000000 次达到满级 100。
        var ratio = Math.max(0, Math.min(1, uses / COOKING_MAX_PROFICIENCY_USES));
        return Math.max(1, Math.min(COOKING_SKILL_MAX_LEVEL, 1 + Math.floor(ratio * (COOKING_SKILL_MAX_LEVEL - 1))));
    }

    /** 重算角色属性（依赖注入；对应 scene-app recalcCharacterStatsFromIE）。 */
    function recalcCharacterStats() {
        if (typeof uiDeps.recalcCharacterStats === 'function') uiDeps.recalcCharacterStats();
    }

    /** 确保 life_cooking 技能条目存在且等级/熟练度一致（clamp + 曲线映射 + 重算）。 */
    function ensureLifeCookingSkillEntry() {
        var IE = getIE();
        if (!IE || typeof IE.getState !== 'function') return false;
        var st = IE.getState();
        if (!st || typeof st !== 'object') return false;
        if (!st.skills || typeof st.skills !== 'object') st.skills = {};
        if (!st.skills.life_cooking || typeof st.skills.life_cooking !== 'object') {
            st.skills.life_cooking = { level: 1, move_usage: {} };
            recalcCharacterStats();
            return true;
        }
        var changed = false;
        var lv = Math.max(0, parseInt(st.skills.life_cooking.level, 10) || 0);
        if (lv < 1) {
            st.skills.life_cooking.level = 1;
            changed = true;
        } else if (lv > COOKING_SKILL_MAX_LEVEL) {
            st.skills.life_cooking.level = COOKING_SKILL_MAX_LEVEL;
            changed = true;
        }
        if (!st.skills.life_cooking.move_usage || typeof st.skills.life_cooking.move_usage !== 'object') {
            st.skills.life_cooking.move_usage = {};
            changed = true;
        }
        var uses = Math.max(0, parseInt(st.skills.life_cooking.move_usage.cooking_success, 10) || 0);
        var mappedLv = getCookingLevelBySuccessUses(uses);
        if ((parseInt(st.skills.life_cooking.level, 10) || 0) !== mappedLv) {
            st.skills.life_cooking.level = mappedLv;
            changed = true;
        }
        if (changed) recalcCharacterStats();
        return true;
    }

    /** 烹饪成功 +1 熟练度（move_usage.cooking_success）并按曲线升等级。 */
    function addCookingSuccessProficiency() {
        var IE = getIE();
        if (!IE || typeof IE.incrementSkillMoveUsage !== 'function' || typeof IE.getState !== 'function') return;
        if (!ensureLifeCookingSkillEntry()) return;
        var newUses = IE.incrementSkillMoveUsage('life_cooking', 'cooking_success', 1);
        var st = IE.getState();
        if (!st || !st.skills || !st.skills.life_cooking) return;
        var ent = st.skills.life_cooking;
        var nextLv = getCookingLevelBySuccessUses(newUses);
        var curLv = Math.max(1, parseInt(ent.level, 10) || 1);
        if (nextLv !== curLv) {
            ent.level = nextLv;
            recalcCharacterStats();
        }
    }

    var E = global.GameEngine;
    var IE = global.InventoryEquipment;

    /** 停 idle 计时器（依赖注入；对应 scene-app stopCookingCraftIdle）。 */
    function stopCraftIdle() {
        if (typeof uiDeps.stopCookingIdle === 'function') uiDeps.stopCookingIdle();
    }
    /** 面板刷新钩子（依赖注入；对应 scene-app「open 时 renderCookingStationPanel」）。 */
    function refreshCookingPanel() {
        if (typeof uiDeps.refreshCookingPanel === 'function') uiDeps.refreshCookingPanel();
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

    /** 烹饪制作结算（原 scene-app finalizeCookingCraftNow 迁出；行为零变）。 */
    function finalizeCraftNow(craftSnap, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var craft = craftSnap && typeof craftSnap === 'object' ? craftSnap : getActiveCraft();
        // finalize 前清掉 active_craft，防止重入
        clearActiveCraft();
        stopCraftIdle();

        if (!craft || !craft.method_id) return;
        var mid = String(craft.method_id).trim();
        var m = CookingStation.getMethods() && CookingStation.getMethods()[mid] ? CookingStation.getMethods()[mid] : null;
        var failId = CookingStation.getFailureItemId();
        var forceFailure = !!opts.force_failure;
        var selected = StationCraftCore.normalizeCookingInputs(craft.inputs || []);
        var matched = StationCraftCore.matchCookingRecipesByInputs(selected, mid);

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
            showMsg(ui('cooking.msg.done_fail', { item: failId }), 'warn');
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
        var unifiedRet = tryResolveCookingByUnifiedRoute(mid, selected);
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
            try { console.warn('[Cooking][UnifiedRoute] craft failed:', unifiedRet.error); } catch (eLog0) { /* ignore */ }
        }
        if (!pick) {
            if (!matched.length) {
                grantItemOrDrop(failId);
                showMsg(ui('cooking.msg.no_recipe_fail', { item: failId }), 'warn');
                SceneHud.refresh('backpack');
                SceneHud.refresh('status');
                if (global.SceneRenderer) global.SceneRenderer.render();
                return;
            }
            pick = StationCraftCore.pickCookingRecipeWeighted(matched);
            if (!pick) {
                grantItemOrDrop(failId);
                showMsg(ui('cooking.msg.done_fail', { item: failId }), 'warn');
                SceneHud.refresh('backpack');
                SceneHud.refresh('status');
                if (global.SceneRenderer) global.SceneRenderer.render();
                return;
            }
            pickRecipeId = pick.recipe_id ? String(pick.recipe_id) : '';
            pickBaseSuccessRate = pick.base_success_rate != null ? pick.base_success_rate : (m ? m.base_success_rate : 1);
        }

        var pq = global.ProductionQuality;
        var cookingLv = Math.max(0, Math.min(COOKING_SKILL_MAX_LEVEL, getCookingSkillLevel()));
        var evalRes = (pq && typeof pq.evaluateProduction === 'function')
            ? pq.evaluateProduction({
                base_success_rate: pickBaseSuccessRate != null ? pickBaseSuccessRate : (m ? m.base_success_rate : 1),
                // 烹饪系统单独处理技能成功率与溢出品质，不复用通用 skill_level 乘区。
                skill_level: 0,
                input_items: Array.isArray(craft.consumed_items) ? craft.consumed_items.slice() : []
            })
            : { success: true, success_rate: 1 };
        var baseSuccessRate = Math.max(0, Number(evalRes.success_rate) || 0);
        var bonusFromCookingLv = cookingLv * COOKING_SUCCESS_BONUS_PER_LEVEL;
        var successRateRaw = baseSuccessRate + bonusFromCookingLv;
        var successRateFinal = StationCraftCore.getProductionSuccessRateWithMoodDelta(successRateRaw);
        var overflowRate = Math.max(0, successRateRaw - 1);
        var isMaxCookingLv = cookingLv >= COOKING_SKILL_MAX_LEVEL;
        evalRes.success = isMaxCookingLv ? true : (Math.random() < successRateFinal);
        evalRes.success_rate = successRateFinal;

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
        if (evalRes.success) addCookingSuccessProficiency();

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
                ? ui('cooking.msg.done_ok', { item: outputItemId, method: mid })
                : ui('cooking.msg.done_fail', { item: failId }),
            evalRes.success ? 'success' : 'warn'
        );
        SceneHud.refresh('backpack');
        SceneHud.refresh('status');
        if (global.SceneRenderer) global.SceneRenderer.render();
    }

    /** 世界 tick 推进制作（remaining_ticks -1，到点 finalize；原 scene-app tickCookingCraftAfterWorldTick）。 */
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
        refreshCookingPanel();
    }

    /** 临时灶台实体 id（世界实体标记；原 scene-app 闭包常量）。 */
    var COOKING_TEMP_STATION_ENTITY_ID = 'cooking_station_temp';

    function getMapsRefLocal() {
        return (global.GameEngine && typeof global.GameEngine.getMaps === 'function') ? global.GameEngine.getMaps() : null;
    }
    function markDirtyCell(x, y) {
        if (global.SceneCtx && typeof global.SceneCtx.pushDirtyCell === 'function') global.SceneCtx.pushDirtyCell(x, y);
    }

    function normalizeTempStationEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        var mapId = entry.map_id != null ? String(entry.map_id) : '';
        var x = Math.floor(Number(entry.x));
        var y = Math.floor(Number(entry.y));
        var placedTick = Math.max(0, Math.floor(Number(entry.placed_tick) || 0));
        var despawnTick = Math.max(0, Math.floor(Number(entry.despawn_tick) || 0));
        if (!mapId || !isFinite(x) || !isFinite(y) || despawnTick <= 0) return null;
        return {
            entity_id: COOKING_TEMP_STATION_ENTITY_ID,
            map_id: mapId,
            x: x,
            y: y,
            placed_tick: placedTick,
            despawn_tick: despawnTick,
            allowed_methods: Array.isArray(entry.allowed_methods)
                ? entry.allowed_methods.map(function (m0) { return String(m0).trim(); }).filter(function (m1) { return !!m1; })
                : [],
            installed_accessory_item_ids: Array.isArray(entry.installed_accessory_item_ids)
                ? entry.installed_accessory_item_ids.map(function (z) { return String(z).trim(); }).filter(function (z0) { return !!z0; })
                : []
        };
    }

    /** 归一化后的临时灶台运行时列表（SceneCtx.cooking_temp_stations_runtime）。 */
    function getCookingTempStationsRuntime() {
        if (!global.SceneCtx) return [];
        if (!Array.isArray(global.SceneCtx.cooking_temp_stations_runtime)) {
            global.SceneCtx.cooking_temp_stations_runtime = [];
        }
        var arr = global.SceneCtx.cooking_temp_stations_runtime;
        var out = [];
        var i;
        for (i = 0; i < arr.length; i++) {
            var norm = normalizeTempStationEntry(arr[i]);
            if (norm) out.push(norm);
        }
        global.SceneCtx.cooking_temp_stations_runtime = out;
        return out;
    }

    function isCookingTempStationEntity(rec) {
        if (!rec || typeof rec !== 'object') return false;
        return String(rec.entity_id || '') === COOKING_TEMP_STATION_ENTITY_ID;
    }

    function findCookingTempStationAt(mapId, x, y) {
        var arr = getCookingTempStationsRuntime();
        var i;
        for (i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (e.map_id === mapId && e.x === x && e.y === y) return e;
        }
        return null;
    }

    function upsertCookingTempStation(entry) {
        var norm = normalizeTempStationEntry(entry);
        if (!norm) return null;
        var arr = getCookingTempStationsRuntime();
        var i;
        for (i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (e.map_id === norm.map_id && e.x === norm.x && e.y === norm.y) {
                arr[i] = norm;
                return norm;
            }
        }
        arr.push(norm);
        return norm;
    }

    function removeCookingTempStationAt(mapId, x, y) {
        var arr = getCookingTempStationsRuntime();
        var i;
        for (i = arr.length - 1; i >= 0; i--) {
            var e = arr[i];
            if (e.map_id === mapId && e.x === x && e.y === y) arr.splice(i, 1);
        }
    }

    /** 把运行时临时灶台全量同步进各地图 entities（先清旧实体再按列表重建）。 */
    function syncCookingTempStationsIntoMaps() {
        var maps = getMapsRefLocal();
        if (!maps || typeof maps !== 'object') return;
        var mapIds = Object.keys(maps);
        var i;
        for (i = 0; i < mapIds.length; i++) {
            var map = maps[mapIds[i]];
            if (!map || !Array.isArray(map.entities)) continue;
            var kept = [];
            var j;
            for (j = 0; j < map.entities.length; j++) {
                var rec = map.entities[j];
                if (isCookingTempStationEntity(rec)) continue;
                kept.push(rec);
            }
            map.entities = kept;
        }
        var arr = getCookingTempStationsRuntime();
        for (i = 0; i < arr.length; i++) {
            var e = arr[i];
            var m = maps[e.map_id];
            if (!m) continue;
            if (!Array.isArray(m.entities)) m.entities = [];
            m.entities.push({
                x: e.x,
                y: e.y,
                entity_id: COOKING_TEMP_STATION_ENTITY_ID,
                placed_tick: e.placed_tick,
                despawn_tick: e.despawn_tick,
                allowed_methods: Array.isArray(e.allowed_methods) ? e.allowed_methods.slice() : [],
                installed_accessory_item_ids: Array.isArray(e.installed_accessory_item_ids) ? e.installed_accessory_item_ids.slice() : []
            });
        }
    }

    /** 在指定格放置临时灶台（lifetime 缺省取配置寿命）。 */
    function placeTempCookingStation(mapId, x, y, options) {
        var gt = global.GameTime && typeof global.GameTime.getState === 'function' ? global.GameTime.getState() : null;
        var placedTick = gt && typeof gt.totalTicks === 'number' ? Math.max(0, Math.floor(gt.totalTicks)) : 0;
        var opts = options && typeof options === 'object' ? options : {};
        var life = Math.max(1, Math.floor(Number(opts.lifetime_ticks) || getTempStationLifetimeTicks() || 50));
        var next = upsertCookingTempStation({
            map_id: String(mapId || ''),
            x: Math.floor(Number(x)),
            y: Math.floor(Number(y)),
            placed_tick: placedTick,
            despawn_tick: placedTick + life,
            allowed_methods: Array.isArray(opts.allowed_methods) ? opts.allowed_methods.slice() : [],
            installed_accessory_item_ids: Array.isArray(opts.installed_accessory_item_ids) ? opts.installed_accessory_item_ids.slice() : []
        });
        if (!next) return null;
        syncCookingTempStationsIntoMaps();
        markDirtyCell(next.x, next.y);
        if (global.SceneRenderer) global.SceneRenderer.render();
        return Object.assign({}, next);
    }

    /** 当前进行中制作是否落在该临时灶台（station_type='temp' 且坐标匹配）。 */
    function isActiveCraftOnTempStation(mapId, x, y) {
        var cs = getState();
        var ac = cs && cs.active_craft && typeof cs.active_craft === 'object' ? cs.active_craft : null;
        if (!ac || !ac.station_ref || typeof ac.station_ref !== 'object') return false;
        var ref = ac.station_ref;
        return String(ref.station_type || '') === 'temp'
            && String(ref.map_id || '') === String(mapId || '')
            && Math.floor(Number(ref.x)) === Math.floor(Number(x))
            && Math.floor(Number(ref.y)) === Math.floor(Number(y));
    }

    /** 世界 tick：到期临时灶台移除（其上 active craft 强制失败结算）；原 scene-app tickCookingTempStationsAfterWorldTick。 */
    function tickCookingTempStationsAfterWorldTick() {
        var gt = global.GameTime && typeof global.GameTime.getState === 'function' ? global.GameTime.getState() : null;
        var nowTick = gt && typeof gt.totalTicks === 'number' ? Math.max(0, Math.floor(gt.totalTicks)) : 0;
        var arr = getCookingTempStationsRuntime();
        if (!arr.length) return;
        var changed = false;
        var i;
        for (i = arr.length - 1; i >= 0; i--) {
            var e = arr[i];
            if (nowTick < e.despawn_tick) continue;
            var hasActiveCraft = isActiveCraftOnTempStation(e.map_id, e.x, e.y);
            if (hasActiveCraft) {
                var cs = getState();
                var ac = cs && cs.active_craft && typeof cs.active_craft === 'object' ? cs.active_craft : null;
                if (ac) finalizeCraftNow(ac, { force_failure: true, reason: 'temp_station_despawn' });
            }
            arr.splice(i, 1);
            changed = true;
            markDirtyCell(e.x, e.y);
        }
        if (changed) {
            syncCookingTempStationsIntoMaps();
            refreshCookingPanel();
            if (global.SceneRenderer) global.SceneRenderer.render();
        }
    }

    global.CookingStation = {
        setConfig: setConfig,
        getMethods: getMethods,
        getRecipes: getRecipes,
        getFailureItemId: getFailureItemId,
        getTempStationLifetimeTicks: getTempStationLifetimeTicks,
        recipeSystemId: RECIPE_SYSTEM_ID,
        markRecipeKnown: markRecipeKnown,
        createDefaultState: createDefaultState,
        getState: getState,
        setUiDeps: setUiDeps,
        ui: ui,
        showMsg: showMsg,
        tryResolveCookingByUnifiedRoute: tryResolveCookingByUnifiedRoute,
        COOKING_SKILL_MAX_LEVEL: COOKING_SKILL_MAX_LEVEL,
        COOKING_MAX_PROFICIENCY_USES: COOKING_MAX_PROFICIENCY_USES,
        COOKING_SUCCESS_BONUS_PER_LEVEL: COOKING_SUCCESS_BONUS_PER_LEVEL,
        getCookingSkillLevel: getCookingSkillLevel,
        getCookingLevelBySuccessUses: getCookingLevelBySuccessUses,
        ensureLifeCookingSkillEntry: ensureLifeCookingSkillEntry,
        addCookingSuccessProficiency: addCookingSuccessProficiency,
        getActiveCraft: getActiveCraft,
        clearActiveCraft: clearActiveCraft,
        finalizeCraftNow: finalizeCraftNow,
        tickCraftAfterWorldTick: tickCraftAfterWorldTick,
        normalizeTempStationEntry: normalizeTempStationEntry,
        getCookingTempStationsRuntime: getCookingTempStationsRuntime,
        isCookingTempStationEntity: isCookingTempStationEntity,
        findCookingTempStationAt: findCookingTempStationAt,
        removeCookingTempStationAt: removeCookingTempStationAt,
        syncCookingTempStationsIntoMaps: syncCookingTempStationsIntoMaps,
        placeTempCookingStation: placeTempCookingStation,
        isActiveCraftOnTempStation: isActiveCraftOnTempStation,
        tickCookingTempStationsAfterWorldTick: tickCookingTempStationsAfterWorldTick
    };
})(typeof window !== 'undefined' ? window : globalThis);
