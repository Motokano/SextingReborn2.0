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
        addCookingSuccessProficiency: addCookingSuccessProficiency
    };
})(typeof window !== 'undefined' ? window : globalThis);
