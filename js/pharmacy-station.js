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

    global.PharmacyStation = {
        setConfig: setConfig,
        getMethods: getMethods,
        getRecipes: getRecipes,
        getFailureItemId: getFailureItemId,
        recipeSystemId: RECIPE_SYSTEM_ID,
        markRecipeKnown: markRecipeKnown
    };
})(typeof window !== 'undefined' ? window : globalThis);
