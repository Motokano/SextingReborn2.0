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

    global.CookingStation = {
        setConfig: setConfig,
        getMethods: getMethods,
        getRecipes: getRecipes,
        getFailureItemId: getFailureItemId,
        getTempStationLifetimeTicks: getTempStationLifetimeTicks,
        recipeSystemId: RECIPE_SYSTEM_ID,
        markRecipeKnown: markRecipeKnown
    };
})(typeof window !== 'undefined' ? window : globalThis);
