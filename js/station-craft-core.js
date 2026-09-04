/**
 * StationCraftCore — 站点制作公共逻辑（scene-app 组合根化拆解 P1b-3）
 *
 * 来源：自 js/scene-app.js 原样迁出（配方匹配簇 12 函数），行为零变：
 *   归一化 normalizeCookingInputs/normalizePharmacyInputs、toCountMap、
 *   recipeInputsSatisfiedBySelected、盲配 match*RecipesByInputs、
 *   加权随机 pick*RecipeWeighted、配料消耗/退还 consumeInventoryItemsByList/putItemsBack、
 *   工艺 id 统一前缀 toUnified*MethodId。
 *
 * 共享方：烹饪/制药/沤肥三站点（putItemsBack 与 consumeInventoryItemsByList
 * 的调用者含 compost 交互，见原 scene-app 8810-8850 一带）。
 * 模块内互相引用均为局部（整体搬移），对外仅依赖 window.InventoryEquipment /
 * window.InventoryHelpers / CookingStation.getRecipes() / PharmacyStation.getRecipes()（调用期解析）。
 */
(function (global) {
    'use strict';

    function getIE() {
        return global.InventoryEquipment || null;
    }

    function normalizeCookingInputs(rawInputs) {
        if (!Array.isArray(rawInputs) || !rawInputs.length) return [];
        var byId = {};
        var i;
        for (i = 0; i < rawInputs.length; i++) {
            var r = rawInputs[i] || {};
            var id = r.item_id != null ? String(r.item_id).trim() : '';
            if (!id) continue;
            var c = parseInt(r.count, 10);
            if (!isFinite(c) || c <= 0) c = 1;
            byId[id] = (byId[id] || 0) + c;
        }
        var out = [];
        var keys = Object.keys(byId);
        for (i = 0; i < keys.length; i++) out.push({ item_id: keys[i], count: byId[keys[i]] });
        return out;
    }

    function normalizePharmacyInputs(rawInputs) {
        if (!Array.isArray(rawInputs) || !rawInputs.length) return [];
        var byId = {};
        var i;
        for (i = 0; i < rawInputs.length; i++) {
            var r = rawInputs[i] || {};
            var id = r.item_id != null ? String(r.item_id).trim() : '';
            if (!id) continue;
            var c = parseInt(r.count, 10);
            if (!isFinite(c) || c <= 0) c = 1;
            byId[id] = (byId[id] || 0) + c;
        }
        var out = [];
        var keys = Object.keys(byId);
        for (i = 0; i < keys.length; i++) out.push({ item_id: keys[i], count: byId[keys[i]] });
        return out;
    }

    function toCountMap(list) {
        var m = {};
        var i;
        for (i = 0; i < list.length; i++) {
            var it = list[i] || {};
            var id = it.item_id != null ? String(it.item_id) : '';
            var c = parseInt(it.count, 10);
            if (!id || !isFinite(c) || c <= 0) continue;
            m[id] = (m[id] || 0) + c;
        }
        return m;
    }

    function recipeInputsSatisfiedBySelected(recipe, selectedInputs) {
        var selectedMap = toCountMap(selectedInputs || []);
        var reqs = Array.isArray(recipe && recipe.inputs) ? recipe.inputs : [];
        var j;
        for (j = 0; j < reqs.length; j++) {
            var need = reqs[j] || {};
            var id = need.item_id != null ? String(need.item_id) : '';
            var cnt = parseInt(need.count, 10);
            if (!isFinite(cnt) || cnt <= 0) cnt = 1;
            if (!id || (selectedMap[id] || 0) < cnt) return false;
        }
        return reqs.length > 0;
    }

    /** 盲配：仅按投料 multiset 是否包含配方需求命中；可选 methodFilter 限制 required_method。 */
    function matchCookingRecipesByInputs(selectedInputs, methodFilter) {
        var out = [];
        var i;
        var mf = methodFilter != null && String(methodFilter) !== '' ? String(methodFilter) : null;
        for (i = 0; i < CookingStation.getRecipes().length; i++) {
            var r = CookingStation.getRecipes()[i] || {};
            var reqMethod = r.required_method != null ? String(r.required_method) : '';
            var recipeMethod = r.method_id != null ? String(r.method_id) : '';
            if (mf != null && reqMethod !== mf && recipeMethod !== mf && toUnifiedCookingMethodId(reqMethod) !== mf && toUnifiedCookingMethodId(recipeMethod) !== mf) continue;
            if (recipeInputsSatisfiedBySelected(r, selectedInputs)) out.push(r);
        }
        return out;
    }

    function matchPharmacyRecipesByInputs(selectedInputs, methodFilter) {
        var out = [];
        var i;
        var mf = methodFilter != null && String(methodFilter) !== '' ? String(methodFilter) : null;
        for (i = 0; i < PharmacyStation.getRecipes().length; i++) {
            var r = PharmacyStation.getRecipes()[i] || {};
            var reqMethod = r.required_method != null ? String(r.required_method) : '';
            var recipeMethod = r.method_id != null ? String(r.method_id) : '';
            if (mf != null && reqMethod !== mf && recipeMethod !== mf && toUnifiedPharmacyMethodId(reqMethod) !== mf && toUnifiedPharmacyMethodId(recipeMethod) !== mf) continue;
            if (recipeInputsSatisfiedBySelected(r, selectedInputs)) out.push(r);
        }
        return out;
    }

    /** 按 match_weight（缺省 1）加权随机选一条配方。 */
    function pickCookingRecipeWeighted(recipes) {
        if (!Array.isArray(recipes) || !recipes.length) return null;
        var total = 0;
        var i, w;
        var weights = [];
        for (i = 0; i < recipes.length; i++) {
            w = recipes[i].match_weight != null ? parseFloat(recipes[i].match_weight, 10) : 1;
            if (!isFinite(w) || w <= 0) w = 1;
            weights.push(w);
            total += w;
        }
        var roll = Math.random() * total;
        var acc = 0;
        for (i = 0; i < recipes.length; i++) {
            acc += weights[i];
            if (roll < acc) return recipes[i];
        }
        return recipes[recipes.length - 1];
    }

    function pickPharmacyRecipeWeighted(recipes) {
        if (!Array.isArray(recipes) || !recipes.length) return null;
        var total = 0;
        var i, w;
        var weights = [];
        for (i = 0; i < recipes.length; i++) {
            w = recipes[i].match_weight != null ? parseFloat(recipes[i].match_weight, 10) : 1;
            if (!isFinite(w) || w <= 0) w = 1;
            weights.push(w);
            total += w;
        }
        var roll = Math.random() * total;
        var acc = 0;
        for (i = 0; i < recipes.length; i++) {
            acc += weights[i];
            if (roll < acc) return recipes[i];
        }
        return recipes[recipes.length - 1];
    }

    /** 按输入清单从仓库(优先)/三容器逐件扣除；失败时部分退还由调用方决定。 */
    function consumeInventoryItemsByList(inputList) {
        var normalized = normalizeCookingInputs(inputList);
        if (!normalized.length) return { ok: true, consumed: [] };

        var HW = global.HideoutWarehouse;
        if (HW && typeof HW.consumeItems === 'function') {
            var pay = HW.consumeItems(normalized);
            if (!pay || !pay.ok) return { ok: false, consumed: [] };
            var out = [];
            var rows = pay.consumed || [];
            var ri;
            for (ri = 0; ri < rows.length; ri++) {
                var row = rows[ri];
                if (!row || !row.item_id) continue;
                var cnt = row.count != null ? parseInt(row.count, 10) : 1;
                if (!isFinite(cnt) || cnt < 1) cnt = 1;
                var j;
                for (j = 0; j < cnt; j++) {
                    out.push({
                        item_id: String(row.item_id),
                        count: 1
                    });
                }
            }
            return { ok: true, consumed: out, rawConsumed: rows };
        }

        var consumed = [];
        var i;
        for (i = 0; i < normalized.length; i++) {
            var entry = normalized[i] || {};
            var id = entry.item_id != null ? String(entry.item_id) : '';
            var need = parseInt(entry.count, 10);
            if (!id || !isFinite(need) || need <= 0) continue;
            var k;
            for (k = 0; k < need; k++) {
                var slot = global.InventoryHelpers.findFirstContainerSlotByItemId(id);
                if (!slot) return { ok: false, consumed: consumed };
                var taken = getIE().takeItemFromContainer(slot.containerType, slot.index);
                if (!taken || !taken.success || !taken.item) return { ok: false, consumed: consumed };
                consumed.push(taken.item);
            }
        }
        return { ok: true, consumed: consumed };
    }

    /** 把物品清单退回默认容器（放不下即丢弃；原实现无落地点，保持行为一致）。 */
    function putItemsBack(items) {
        var IE = getIE();
        if (!Array.isArray(items) || !IE || typeof IE.putItemIntoDefaultContainer !== 'function') return;
        var i;
        for (i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it || !it.item_id) continue;
            IE.putItemIntoDefaultContainer(it);
        }
    }

    /** 灶台工艺 id 与 cooking-methods.json 键一致（如 boil_stew）；统一表 method_id 为 life_cooking.boil_stew。 */
    function toUnifiedCookingMethodId(legacyMethodId) {
        var s = String(legacyMethodId || '').trim();
        if (!s) return '';
        if (s.indexOf('life_cooking.') === 0) return s;
        return 'life_cooking.' + s;
    }

    function toUnifiedPharmacyMethodId(legacyMethodId) {
        var s = String(legacyMethodId || '').trim();
        if (!s) return '';
        if (s.indexOf('life_pharmacy.') === 0) return s;
        return 'life_pharmacy.' + s;
    }

    /** 读取方法成本字段（cost[key] 优先，legacyKey 兜底；原 scene-app readMethodCostValue 逐字迁移）。 */
    function readMethodCostValue(methodObj, key, legacyKey) {
        var m = methodObj && typeof methodObj === 'object' ? methodObj : {};
        var cost = m.cost && typeof m.cost === 'object' ? m.cost : null;
        var v = cost && cost[key] != null ? Number(cost[key]) : NaN;
        if (!isFinite(v)) v = Number(m[legacyKey]);
        if (!isFinite(v)) v = 0;
        return Math.max(0, Math.floor(v));
    }

    /** 心情 Buff 修正后的最终成功率（clamp [0,1]；原 scene-app getProductionSuccessRateWithMoodDelta）。 */
    function getProductionSuccessRateWithMoodDelta(baseRateRaw) {
        var successRateRaw = Math.max(0, Number(baseRateRaw) || 0);
        if (global.BuffSystem && typeof global.BuffSystem.getProductionSuccessRateDeltaPercent === 'function') {
            var moodDeltaPct = Number(global.BuffSystem.getProductionSuccessRateDeltaPercent('player')) || 0;
            successRateRaw += (moodDeltaPct / 100);
        }
        return Math.max(0, Math.min(1, successRateRaw));
    }

    global.StationCraftCore = {
        normalizeCookingInputs: normalizeCookingInputs,
        normalizePharmacyInputs: normalizePharmacyInputs,
        toCountMap: toCountMap,
        recipeInputsSatisfiedBySelected: recipeInputsSatisfiedBySelected,
        matchCookingRecipesByInputs: matchCookingRecipesByInputs,
        matchPharmacyRecipesByInputs: matchPharmacyRecipesByInputs,
        pickCookingRecipeWeighted: pickCookingRecipeWeighted,
        pickPharmacyRecipeWeighted: pickPharmacyRecipeWeighted,
        consumeInventoryItemsByList: consumeInventoryItemsByList,
        putItemsBack: putItemsBack,
        toUnifiedCookingMethodId: toUnifiedCookingMethodId,
        toUnifiedPharmacyMethodId: toUnifiedPharmacyMethodId,
        readMethodCostValue: readMethodCostValue,
        getProductionSuccessRateWithMoodDelta: getProductionSuccessRateWithMoodDelta
    };
})(typeof window !== 'undefined' ? window : globalThis);
