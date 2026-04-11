/**
 * Unified Recipe Schema Validator
 * Runtime/editor shared validator for recipes/methods/interfaces.
 */
(function (global) {
    'use strict';

    var LIFE_SYSTEMS = {
        life_cooking: true,
        life_forging: true,
        life_pharmacy: true,
        life_weaving: true,
        life_manufacturing: true,
        life_enchant: true
    };
    var ALLOWED_UNLOCK_TYPES = {
        skill_level_min: true,
        quest_flag: true,
        npc_flag: true
    };

    function hasOwn(obj, key) {
        return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
    }

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    function asNonEmptyString(v) {
        if (v == null) return '';
        var s = String(v).trim();
        return s;
    }

    function isPositiveNumber(n) {
        return typeof n === 'number' && isFinite(n) && n > 0;
    }

    function makeCollector() {
        var errors = [];
        var warnings = [];
        function push(arr, entryType, id, code, message, path) {
            arr.push({
                entry_type: String(entryType || ''),
                id: String(id || ''),
                error_code: String(code || ''),
                message: String(message || ''),
                path: path ? String(path) : ''
            });
        }
        return {
            errors: errors,
            warnings: warnings,
            error: function (entryType, id, code, message, path) {
                push(errors, entryType, id, code, message, path);
            },
            warn: function (entryType, id, code, message, path) {
                push(warnings, entryType, id, code, message, path);
            }
        };
    }

    function validateRecipeSystem(system, entryType, id, collector, path) {
        if (!LIFE_SYSTEMS[system]) {
            collector.error(entryType, id, 'RECIPE_SYSTEM_INVALID', 'recipe_system 必须是 life_* 枚举之一。', path || 'recipe_system');
            return false;
        }
        return true;
    }

    function validateIdPattern(expectedSystem, value, expectedPrefix, entryType, id, collector, code, path) {
        var actual = asNonEmptyString(value);
        if (!actual) {
            collector.error(entryType, id, code, expectedPrefix + ' 不能为空。', path);
            return false;
        }
        if (actual.indexOf(expectedSystem + '.') !== 0) {
            collector.error(entryType, id, code, expectedPrefix + ' 必须匹配 {' + expectedSystem + '}.{slug}。', path);
            return false;
        }
        return true;
    }

    function validateItemStack(stack, entryType, id, collector, path) {
        if (!isPlainObject(stack)) {
            collector.error(entryType, id, 'STACK_INVALID', '物品堆叠项必须为对象。', path);
            return false;
        }
        var itemId = asNonEmptyString(stack.item_id);
        var count = Number(stack.count);
        var ok = true;
        if (!itemId) {
            collector.error(entryType, id, 'STACK_ITEM_ID_REQUIRED', 'item_id 不能为空。', path + '.item_id');
            ok = false;
        }
        if (!(isFinite(count) && count > 0)) {
            collector.error(entryType, id, 'STACK_COUNT_INVALID', 'count 必须大于 0。', path + '.count');
            ok = false;
        }
        return ok;
    }

    function validateUnlockArray(unlock, entryType, id, collector, path) {
        if (unlock == null) return true;
        if (!Array.isArray(unlock)) {
            collector.error(entryType, id, 'UNLOCK_NOT_ARRAY', 'unlock 必须是数组。', path);
            return false;
        }
        var ok = true;
        for (var i = 0; i < unlock.length; i++) {
            var row = unlock[i];
            var rowPath = path + '[' + i + ']';
            if (!isPlainObject(row)) {
                collector.error(entryType, id, 'UNLOCK_ENTRY_INVALID', 'unlock 条目必须是对象。', rowPath);
                ok = false;
                continue;
            }
            var t = asNonEmptyString(row.type);
            if (!ALLOWED_UNLOCK_TYPES[t]) {
                collector.error(entryType, id, 'UNLOCK_TYPE_UNSUPPORTED', 'unlock.type 不受支持：' + t, rowPath + '.type');
                ok = false;
                continue;
            }
            if (t === 'skill_level_min') {
                var sid = asNonEmptyString(row.skill_id || row.skillId);
                var lv = Number(row.level);
                if (!sid) {
                    collector.error(entryType, id, 'UNLOCK_SKILL_ID_REQUIRED', 'skill_level_min 需要 skill_id。', rowPath + '.skill_id');
                    ok = false;
                }
                if (!(isFinite(lv) && lv >= 0)) {
                    collector.error(entryType, id, 'UNLOCK_SKILL_LEVEL_INVALID', 'skill_level_min.level 必须 >= 0。', rowPath + '.level');
                    ok = false;
                }
                continue;
            }
            if (t === 'quest_flag') {
                var qf = asNonEmptyString(row.flag);
                if (!qf) {
                    collector.error(entryType, id, 'UNLOCK_QUEST_FLAG_REQUIRED', 'quest_flag 需要 flag。', rowPath + '.flag');
                    ok = false;
                }
                continue;
            }
            if (t === 'npc_flag') {
                var npcId = asNonEmptyString(row.npc_id || row.npcId);
                var nflag = asNonEmptyString(row.flag);
                if (!npcId) {
                    collector.error(entryType, id, 'UNLOCK_NPC_ID_REQUIRED', 'npc_flag 需要 npc_id。', rowPath + '.npc_id');
                    ok = false;
                }
                if (!nflag) {
                    collector.error(entryType, id, 'UNLOCK_NPC_FLAG_REQUIRED', 'npc_flag 需要 flag。', rowPath + '.flag');
                    ok = false;
                }
            }
        }
        return ok;
    }

    function validateMethodEntry(methodId, method, collector) {
        var entryType = 'method';
        var ok = true;
        if (!isPlainObject(method)) {
            collector.error(entryType, methodId, 'METHOD_NOT_OBJECT', 'method 条目必须是对象。');
            return false;
        }

        var sys = asNonEmptyString(method.recipe_system);
        ok = validateRecipeSystem(sys, entryType, methodId, collector, 'recipe_system') && ok;
        ok = validateIdPattern(sys, method.method_id, 'method_id', entryType, methodId, collector, 'METHOD_ID_INVALID', 'method_id') && ok;

        if (!isPlainObject(method.cost)) {
            collector.error(entryType, methodId, 'METHOD_COST_INVALID', 'cost 必须为对象。', 'cost');
            ok = false;
        } else {
            var costKeys = ['fuel', 'water', 'ticks', 'stamina'];
            for (var i = 0; i < costKeys.length; i++) {
                var ck = costKeys[i];
                var cv = Number(method.cost[ck]);
                if (!isFinite(cv) || cv < 0) {
                    collector.error(entryType, methodId, 'METHOD_COST_FIELD_INVALID', 'cost.' + ck + ' 必须是 >= 0 的数字。', 'cost.' + ck);
                    ok = false;
                }
            }
        }

        var successRate = Number(method.base_success_rate);
        if (!(isFinite(successRate) && successRate >= 0 && successRate <= 1)) {
            collector.error(entryType, methodId, 'METHOD_SUCCESS_RATE_INVALID', 'base_success_rate 必须在 [0,1]。', 'base_success_rate');
            ok = false;
        }

        if (hasOwn(method, 'failure_output') && method.failure_output != null) {
            ok = validateItemStack(method.failure_output, entryType, methodId, collector, 'failure_output') && ok;
        }

        if (hasOwn(method, 'allowed_station_tags') && method.allowed_station_tags != null) {
            if (!Array.isArray(method.allowed_station_tags)) {
                collector.error(entryType, methodId, 'METHOD_STATION_TAGS_INVALID', 'allowed_station_tags 必须为数组或 null。', 'allowed_station_tags');
                ok = false;
            }
        }

        if (hasOwn(method, 'requires_accessory_item_id') && method.requires_accessory_item_id != null) {
            var accId = asNonEmptyString(method.requires_accessory_item_id);
            if (!accId) {
                collector.error(entryType, methodId, 'METHOD_ACCESSORY_ITEM_INVALID', 'requires_accessory_item_id 非 null 时必须为非空字符串。', 'requires_accessory_item_id');
                ok = false;
            }
        }

        ok = validateUnlockArray(method.unlock, entryType, methodId, collector, 'unlock') && ok;
        return ok;
    }

    function validateInterfaceEntry(systemId, iface, collector, methodsMap, recipesMap) {
        var entryType = 'interface';
        var ok = true;
        if (!isPlainObject(iface)) {
            collector.error(entryType, systemId, 'INTERFACE_NOT_OBJECT', 'interface 条目必须是对象。');
            return false;
        }
        ok = validateRecipeSystem(systemId, entryType, systemId, collector, 'interfaces.' + systemId) && ok;

        var reqSkill = asNonEmptyString(iface.required_skill_id);
        if (!reqSkill) {
            collector.error(entryType, systemId, 'INTERFACE_REQUIRED_SKILL_MISSING', 'required_skill_id 不能为空。', 'required_skill_id');
            ok = false;
        }

        var proc = asNonEmptyString(iface.recipe_processor_id);
        if (!proc) {
            collector.error(entryType, systemId, 'INTERFACE_PROCESSOR_MISSING', 'recipe_processor_id 不能为空。', 'recipe_processor_id');
            ok = false;
        }

        var methodId = asNonEmptyString(iface.default_method_id);
        if (methodId && !methodsMap[methodId]) {
            collector.error(entryType, systemId, 'INTERFACE_DEFAULT_METHOD_NOT_FOUND', 'default_method_id 未在 methods 中找到：' + methodId, 'default_method_id');
            ok = false;
        }
        var recipeId = asNonEmptyString(iface.default_recipe_id);
        if (recipeId && !recipesMap[recipeId]) {
            collector.error(entryType, systemId, 'INTERFACE_DEFAULT_RECIPE_NOT_FOUND', 'default_recipe_id 未在 recipes 中找到：' + recipeId, 'default_recipe_id');
            ok = false;
        }

        if (hasOwn(iface, 'allowed_station_tags') && iface.allowed_station_tags != null && !Array.isArray(iface.allowed_station_tags)) {
            collector.error(entryType, systemId, 'INTERFACE_STATION_TAGS_INVALID', 'allowed_station_tags 必须为数组或 null。', 'allowed_station_tags');
            ok = false;
        }
        return ok;
    }

    function validateRecipeEntry(recipeId, recipe, collector, methodsMap, interfacesMap) {
        var entryType = 'recipe';
        var ok = true;
        if (!isPlainObject(recipe)) {
            collector.error(entryType, recipeId, 'RECIPE_NOT_OBJECT', 'recipe 条目必须是对象。');
            return false;
        }

        var sys = asNonEmptyString(recipe.recipe_system);
        ok = validateRecipeSystem(sys, entryType, recipeId, collector, 'recipe_system') && ok;
        ok = validateIdPattern(sys, recipe.recipe_id, 'recipe_id', entryType, recipeId, collector, 'RECIPE_ID_INVALID', 'recipe_id') && ok;

        var methodId = asNonEmptyString(recipe.method_id);
        if (!methodId) {
            collector.error(entryType, recipeId, 'RECIPE_METHOD_ID_REQUIRED', 'method_id 不能为空。', 'method_id');
            ok = false;
        } else if (!methodsMap[methodId]) {
            collector.error(entryType, recipeId, 'RECIPE_METHOD_NOT_FOUND', 'method_id 未在 methods 中找到：' + methodId, 'method_id');
            ok = false;
        } else {
            var m = methodsMap[methodId];
            if (asNonEmptyString(m.recipe_system) !== sys) {
                collector.error(entryType, recipeId, 'RECIPE_METHOD_SYSTEM_CONFLICT', 'recipe.recipe_system 与 method.recipe_system 不一致。', 'method_id');
                ok = false;
            }
            if (hasOwn(recipe, 'required_skill_id') && recipe.required_skill_id !== null && hasOwn(m, 'required_skill_id') && m.required_skill_id !== null) {
                var rSkill = asNonEmptyString(recipe.required_skill_id);
                var mSkill = asNonEmptyString(m.required_skill_id);
                if (rSkill && mSkill && rSkill !== mSkill) {
                    collector.warn(entryType, recipeId, 'RECIPE_OVERRIDE_REQUIRED_SKILL', 'recipe.required_skill_id 覆盖 method.required_skill_id。', 'required_skill_id');
                }
            }
        }

        if (!Array.isArray(recipe.inputs) || recipe.inputs.length <= 0) {
            collector.error(entryType, recipeId, 'RECIPE_INPUTS_INVALID', 'inputs 必须为非空数组。', 'inputs');
            ok = false;
        } else {
            for (var i = 0; i < recipe.inputs.length; i++) {
                ok = validateItemStack(recipe.inputs[i], entryType, recipeId, collector, 'inputs[' + i + ']') && ok;
            }
        }

        if (!validateItemStack(recipe.main_output, entryType, recipeId, collector, 'main_output')) ok = false;

        if (hasOwn(recipe, 'bonus_outputs') && recipe.bonus_outputs != null) {
            if (!Array.isArray(recipe.bonus_outputs)) {
                collector.error(entryType, recipeId, 'RECIPE_BONUS_OUTPUTS_INVALID', 'bonus_outputs 必须为数组。', 'bonus_outputs');
                ok = false;
            } else {
                for (var j = 0; j < recipe.bonus_outputs.length; j++) {
                    var bo = recipe.bonus_outputs[j];
                    var boPath = 'bonus_outputs[' + j + ']';
                    ok = validateItemStack(bo, entryType, recipeId, collector, boPath) && ok;
                    var ch = Number(bo && bo.chance);
                    if (!(isFinite(ch) && ch >= 0 && ch <= 1)) {
                        collector.error(entryType, recipeId, 'RECIPE_BONUS_CHANCE_INVALID', 'bonus_outputs[].chance 必须在 [0,1]。', boPath + '.chance');
                        ok = false;
                    }
                }
            }
        }

        if (hasOwn(recipe, 'match_weight') && recipe.match_weight != null) {
            var w = Number(recipe.match_weight);
            if (!(isFinite(w) && w > 0)) {
                collector.error(entryType, recipeId, 'RECIPE_MATCH_WEIGHT_INVALID', 'match_weight 必须 > 0。', 'match_weight');
                ok = false;
            }
        }

        if (hasOwn(recipe, 'base_success_rate') && recipe.base_success_rate != null) {
            var rs = Number(recipe.base_success_rate);
            if (!(isFinite(rs) && rs >= 0 && rs <= 1)) {
                collector.error(entryType, recipeId, 'RECIPE_SUCCESS_RATE_INVALID', 'base_success_rate 必须在 [0,1] 或为 null。', 'base_success_rate');
                ok = false;
            }
        }

        if (hasOwn(recipe, 'failure_output') && recipe.failure_output != null) {
            ok = validateItemStack(recipe.failure_output, entryType, recipeId, collector, 'failure_output') && ok;
        }
        if (hasOwn(recipe, 'allowed_station_tags') && recipe.allowed_station_tags != null && !Array.isArray(recipe.allowed_station_tags)) {
            collector.error(entryType, recipeId, 'RECIPE_STATION_TAGS_INVALID', 'allowed_station_tags 必须为数组或 null。', 'allowed_station_tags');
            ok = false;
        }

        if (hasOwn(recipe, 'unlock')) {
            ok = validateUnlockArray(recipe.unlock, entryType, recipeId, collector, 'unlock') && ok;
        }

        if (interfacesMap && interfacesMap[sys]) {
            var iface = interfacesMap[sys];
            if (!hasOwn(recipe, 'recipe_processor_id')) {
                if (!asNonEmptyString(iface.recipe_processor_id)) {
                    collector.error(entryType, recipeId, 'RECIPE_PROCESSOR_RESOLUTION_MISSING', 'recipe/method/interface 都未提供 recipe_processor_id。', 'recipe_processor_id');
                    ok = false;
                }
            } else if (recipe.recipe_processor_id === null) {
                var method = methodsMap[methodId];
                var mProc = method ? method.recipe_processor_id : null;
                if (mProc == null && !asNonEmptyString(iface.recipe_processor_id)) {
                    collector.error(entryType, recipeId, 'RECIPE_PROCESSOR_RESOLUTION_MISSING', 'recipe_processor_id 显式 null 后无可用回退。', 'recipe_processor_id');
                    ok = false;
                }
            }
        }

        return ok;
    }

    /**
     * @param {object} rawRecipes  原始 recipes.json 数据（支持 {recipes:{}} 或直接 map）
     * @param {object} rawMethods  原始 recipe-methods.json 数据（支持 {methods:{}} 或直接 map）
     * @param {object} interfaces  原始 life-skill-recipe-interfaces.json 数据（支持 {interfaces:{}} 或直接 map）
     * @param {object} [externalRefs] 预留参数（与编辑器/运行时调用签名兼容；quest/npc 解锁不在此做权威表校验）。
     * @returns {{recipes: object, methods: object, errors: Array, warnings: Array, interfaces: object}}
     */
    function validateRecipeTables(rawRecipes, rawMethods, interfaces, externalRefs) {
        void externalRefs;
        var collector = makeCollector();

        var recipeMap = isPlainObject(rawRecipes) && isPlainObject(rawRecipes.recipes) ? rawRecipes.recipes : (isPlainObject(rawRecipes) ? rawRecipes : {});
        var methodMap = isPlainObject(rawMethods) && isPlainObject(rawMethods.methods) ? rawMethods.methods : (isPlainObject(rawMethods) ? rawMethods : {});
        var interfaceMap = isPlainObject(interfaces) && isPlainObject(interfaces.interfaces) ? interfaces.interfaces : (isPlainObject(interfaces) ? interfaces : {});

        var validMethods = {};
        var validInterfaces = {};
        var validRecipes = {};
        var k;

        for (k in methodMap) {
            if (!hasOwn(methodMap, k)) continue;
            if (validateMethodEntry(k, methodMap[k], collector)) validMethods[k] = methodMap[k];
        }

        for (k in interfaceMap) {
            if (!hasOwn(interfaceMap, k)) continue;
            if (validateInterfaceEntry(k, interfaceMap[k], collector, validMethods, recipeMap)) validInterfaces[k] = interfaceMap[k];
        }

        for (k in recipeMap) {
            if (!hasOwn(recipeMap, k)) continue;
            if (validateRecipeEntry(k, recipeMap[k], collector, validMethods, validInterfaces)) validRecipes[k] = recipeMap[k];
        }

        return {
            recipes: validRecipes,
            methods: validMethods,
            interfaces: validInterfaces,
            errors: collector.errors,
            warnings: collector.warnings
        };
    }

    var api = {
        validateRecipeTables: validateRecipeTables
    };

    global.RecipeSchema = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
