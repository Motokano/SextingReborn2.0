(function (global) {
    'use strict';

    function hasOwn(obj, key) {
        return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
    }

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    function toMap(raw, key) {
        if (isPlainObject(raw) && isPlainObject(raw[key])) return raw[key];
        if (isPlainObject(raw)) return raw;
        return {};
    }

    function asNumber(v, fallback) {
        var n = Number(v);
        return isFinite(n) ? n : fallback;
    }

    function asString(v) {
        if (v == null) return '';
        return String(v).trim();
    }

    function shallowCopy(obj) {
        var out = {};
        var k;
        for (k in obj) {
            if (hasOwn(obj, k)) out[k] = obj[k];
        }
        return out;
    }

    function normalizeInputs(inputs) {
        var map = {};
        if (!Array.isArray(inputs)) return map;
        for (var i = 0; i < inputs.length; i++) {
            var row = inputs[i];
            if (!row) continue;
            var itemId = asString(row.item_id || row.itemId);
            var count = Math.floor(asNumber(row.count, 0));
            if (!itemId || count <= 0) continue;
            map[itemId] = (map[itemId] || 0) + count;
        }
        return map;
    }

    function inputsCover(offerMap, reqList) {
        if (!Array.isArray(reqList) || reqList.length <= 0) return false;
        for (var i = 0; i < reqList.length; i++) {
            var req = reqList[i];
            var itemId = asString(req && (req.item_id || req.itemId));
            var count = Math.floor(asNumber(req && req.count, 0));
            if (!itemId || count <= 0) return false;
            if ((offerMap[itemId] || 0) < count) return false;
        }
        return true;
    }

    var _tables = {
        recipes: {},
        methods: {},
        interfaces: {}
    };
    var _processors = {};

    var ErrorCode = {
        INVALID_CTX: 'RECIPE_INVALID_CTX',
        METHOD_ID_REQUIRED: 'RECIPE_METHOD_ID_REQUIRED',
        METHOD_NOT_FOUND: 'RECIPE_METHOD_NOT_FOUND',
        INTERFACE_NOT_FOUND: 'RECIPE_INTERFACE_NOT_FOUND',
        METHOD_SYSTEM_MISMATCH: 'RECIPE_METHOD_SYSTEM_MISMATCH',
        RECIPE_SYSTEM_REQUIRED: 'RECIPE_SYSTEM_REQUIRED',
        INPUTS_REQUIRED: 'RECIPE_INPUTS_REQUIRED',
        NO_MATCHED_RECIPE: 'RECIPE_NO_MATCHED_RECIPE',
        PROCESSOR_ID_MISSING: 'RECIPE_PROCESSOR_ID_MISSING',
        PROCESSOR_NOT_REGISTERED: 'RECIPE_PROCESSOR_NOT_REGISTERED',
        PROCESSOR_EXECUTION_FAILED: 'RECIPE_PROCESSOR_EXECUTION_FAILED'
    };

    function makeError(code, message, detail) {
        return {
            ok: false,
            error: {
                code: code,
                message: message || '',
                detail: detail || null
            }
        };
    }

    function setTables(recipes, methods, interfaces) {
        if (arguments.length === 1 && isPlainObject(recipes)) {
            methods = recipes.methods;
            interfaces = recipes.interfaces;
            recipes = recipes.recipes;
        }
        _tables.recipes = toMap(recipes, 'recipes');
        _tables.methods = toMap(methods, 'methods');
        _tables.interfaces = toMap(interfaces, 'interfaces');
        return {
            ok: true,
            counts: {
                recipes: Object.keys(_tables.recipes).length,
                methods: Object.keys(_tables.methods).length,
                interfaces: Object.keys(_tables.interfaces).length
            }
        };
    }

    function registerProcessor(id, fn) {
        var sid = asString(id);
        if (!sid || typeof fn !== 'function') {
            return makeError(ErrorCode.INVALID_CTX, 'processor id 或处理函数无效。', { processor_id: sid });
        }
        _processors[sid] = fn;
        return { ok: true, processor_id: sid };
    }

    function resolveField(recipe, method, iface, key, fallback) {
        if (recipe && hasOwn(recipe, key) && recipe[key] !== null && recipe[key] !== undefined) return recipe[key];
        if (method && hasOwn(method, key) && method[key] !== null && method[key] !== undefined) return method[key];
        if (iface && hasOwn(iface, key) && iface[key] !== null && iface[key] !== undefined) return iface[key];
        return fallback;
    }

    function resolveRouteMeta(recipe, method, iface) {
        return {
            required_skill_id: resolveField(recipe, method, iface, 'required_skill_id', null),
            recipe_processor_id: resolveField(recipe, method, iface, 'recipe_processor_id', null),
            proficiency_usage_key: resolveField(recipe, method, iface, 'proficiency_usage_key', null),
            base_success_rate: resolveField(recipe, method, iface, 'base_success_rate', null),
            failure_output: resolveField(recipe, method, iface, 'failure_output', null),
            allowed_station_tags: resolveField(recipe, method, iface, 'allowed_station_tags', null),
            recipe_system: recipe ? recipe.recipe_system : (method ? method.recipe_system : null)
        };
    }

    function validateAndBuildContext(ctx) {
        if (!isPlainObject(ctx)) return makeError(ErrorCode.INVALID_CTX, 'ctx 必须是对象。');

        var methodId = asString(ctx.method_id || ctx.methodId);
        var recipeSystem = asString(ctx.recipe_system || ctx.recipeSystem);
        var inputs = Array.isArray(ctx.inputs) ? ctx.inputs : [];

        if (!methodId) return makeError(ErrorCode.METHOD_ID_REQUIRED, 'method_id 不能为空。');
        if (!recipeSystem) return makeError(ErrorCode.RECIPE_SYSTEM_REQUIRED, 'recipe_system 不能为空。');
        if (!Array.isArray(ctx.inputs)) return makeError(ErrorCode.INPUTS_REQUIRED, 'inputs 必须为数组。');

        var method = _tables.methods[methodId];
        if (!method) return makeError(ErrorCode.METHOD_NOT_FOUND, 'method 未找到。', { method_id: methodId });
        if (asString(method.recipe_system) && asString(method.recipe_system) !== recipeSystem) {
            return makeError(ErrorCode.METHOD_SYSTEM_MISMATCH, 'method.recipe_system 与 ctx.recipe_system 不一致。', {
                method_id: methodId,
                method_recipe_system: method.recipe_system,
                recipe_system: recipeSystem
            });
        }

        var iface = _tables.interfaces[recipeSystem];
        if (!iface) return makeError(ErrorCode.INTERFACE_NOT_FOUND, 'life-skill interface 未找到。', { recipe_system: recipeSystem });

        return {
            ok: true,
            ctx: {
                method_id: methodId,
                recipe_system: recipeSystem,
                inputs: inputs,
                input_map: normalizeInputs(inputs)
            },
            method: method,
            iface: iface
        };
    }

    function weightedPick(rows) {
        var i;
        var total = 0;
        for (i = 0; i < rows.length; i++) {
            total += Math.max(0, asNumber(rows[i].match_weight, 1));
        }
        if (!(total > 0)) return rows[0];
        var r = Math.random() * total;
        var acc = 0;
        for (i = 0; i < rows.length; i++) {
            acc += Math.max(0, asNumber(rows[i].match_weight, 1));
            if (r <= acc) return rows[i];
        }
        return rows[rows.length - 1];
    }

    function matchRecipes(ctx) {
        var check = validateAndBuildContext(ctx);
        if (!check.ok) return check;

        var c = check.ctx;
        var matches = [];
        var recipeId;
        for (recipeId in _tables.recipes) {
            if (!hasOwn(_tables.recipes, recipeId)) continue;
            var recipe = _tables.recipes[recipeId];
            if (!recipe || recipe.enabled === false) continue;
            if (asString(recipe.recipe_system) !== c.recipe_system) continue;
            if (asString(recipe.method_id) !== c.method_id) continue;
            if (!inputsCover(c.input_map, recipe.inputs)) continue;
            matches.push({
                recipe_id: recipeId,
                recipe: recipe,
                match_weight: asNumber(recipe.match_weight, 1)
            });
        }

        if (matches.length <= 0) return makeError(ErrorCode.NO_MATCHED_RECIPE, '未命中可用配方。', {
            method_id: c.method_id,
            recipe_system: c.recipe_system
        });

        return {
            ok: true,
            method: check.method,
            iface: check.iface,
            matches: matches,
            selected: weightedPick(matches)
        };
    }

    function canCraft(ctx) {
        var matched = matchRecipes(ctx);
        if (!matched.ok) return matched;

        var selectedRecipe = matched.selected && matched.selected.recipe;
        var route = resolveRouteMeta(selectedRecipe, matched.method, matched.iface);
        var processorId = asString(route.recipe_processor_id);
        if (!processorId) {
            return makeError(ErrorCode.PROCESSOR_ID_MISSING, '无法解析 recipe_processor_id。', {
                recipe_id: matched.selected && matched.selected.recipe_id
            });
        }
        if (typeof _processors[processorId] !== 'function') {
            return makeError(ErrorCode.PROCESSOR_NOT_REGISTERED, 'processor 未注册。', { recipe_processor_id: processorId });
        }

        return {
            ok: true,
            selected_recipe_id: matched.selected.recipe_id,
            route: route,
            matched_count: matched.matches.length
        };
    }

    function craft(ctx) {
        var matched = matchRecipes(ctx);
        if (!matched.ok) return matched;

        var selected = matched.selected;
        var recipe = selected.recipe;
        var method = matched.method;
        var iface = matched.iface;
        var route = resolveRouteMeta(recipe, method, iface);
        var processorId = asString(route.recipe_processor_id);

        if (!processorId) {
            return makeError(ErrorCode.PROCESSOR_ID_MISSING, '无法解析 recipe_processor_id。', {
                recipe_id: selected.recipe_id
            });
        }
        var processor = _processors[processorId];
        if (typeof processor !== 'function') {
            return makeError(ErrorCode.PROCESSOR_NOT_REGISTERED, 'processor 未注册。', { recipe_processor_id: processorId });
        }

        try {
            var payload = {
                ctx: shallowCopy(ctx || {}),
                recipe_id: selected.recipe_id,
                recipe: recipe,
                method: method,
                iface: iface,
                route: route,
                matches: matched.matches
            };
            var processorResult = processor(payload);
            if (processorResult && processorResult.ok === false) return processorResult;
            return {
                ok: true,
                recipe_id: selected.recipe_id,
                processor_id: processorId,
                route: route,
                result: processorResult === undefined ? null : processorResult
            };
        } catch (err) {
            return makeError(ErrorCode.PROCESSOR_EXECUTION_FAILED, 'processor 执行异常。', {
                recipe_processor_id: processorId,
                error: err && err.message ? String(err.message) : String(err)
            });
        }
    }

    var api = {
        ErrorCode: ErrorCode,
        setTables: setTables,
        registerProcessor: registerProcessor,
        matchRecipes: matchRecipes,
        canCraft: canCraft,
        craft: craft
    };

    global.RecipeSystem = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
