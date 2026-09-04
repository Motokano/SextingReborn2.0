/**
 * ItemUse — 物品使用规则核心（scene-app 组合根化拆解 P6）
 *
 * 来源：自 js/scene-app.js 迁出（applyFoodDigestBuffFromTemplate / toBoolFlag /
 * itemTemplateIsConsumable / applyItemUseEffectFromTemplate / grantFoodAttributeExp +
 * 进食经验反馈通道 lastFoodExpGrantText）。语义零变。
 *
 * 职责：纯规则——判断可食用/可用、应用 buff 或生存量、食物消化 buff、进食属性经验（k79）。
 * 不含 UI/门控（tryUseItemFromContainer/tryEquipItemFromContainer 等容器入口留在主 JS）。
 *
 * 依赖：window.BuffSystem / window.Survival / window.CharacterAttributes；
 * ui() 经 setUiDeps({ ui }) 注入。
 */
(function (global) {
    'use strict';

    var uiDeps = {};
    function setUiDeps(deps) {
        if (deps && typeof deps === 'object') uiDeps = Object.assign({}, uiDeps, deps);
    }
    function ui(key, vars) {
        return (typeof uiDeps.ui === 'function') ? uiDeps.ui(key, vars) : (key != null ? String(key) : '');
    }

    function toBoolFlag(v) {
        if (v === true || v === 1) return true;
        var s = String(v == null ? '' : v).trim().toLowerCase();
        return s === '1' || s === 'true';
    }

    function itemTemplateIsConsumable(tpl) {
        if (!tpl) return false;
        var edible = toBoolFlag(tpl.edible);
        if (edible && tpl.edible_buff_id && String(tpl.edible_buff_id).trim()) return true;
        var usable = toBoolFlag(tpl.usable);
        if (usable && tpl.use_buff_id && String(tpl.use_buff_id).trim()) return true;
        var ue = tpl.use_effect;
        return !!(ue && typeof ue === 'object');
    }

    /** 食物消化 buff（tick 分餐）：注册运行时 buff 模板 + applyBuff；已在消化中返回 false。 */
    function applyFoodDigestBuffFromTemplate(itemId, tpl) {
        var ue = tpl && tpl.use_effect;
        if (!itemId || !ue || typeof ue !== 'object') return false;
        var Buff = global.BuffSystem;
        if (!Buff || typeof Buff.registerRuntimeBuffTemplate !== 'function' || typeof Buff.applyBuff !== 'function') return false;

        var sat = Number(ue.satiety || 0);
        var thi = Number(ue.thirst || 0);
        var nut = Number(ue.nutrition || 0);
        var ene = Number(ue.energy || 0);
        if (!isFinite(sat)) sat = 0;
        if (!isFinite(thi)) thi = 0;
        if (!isFinite(nut)) nut = 0;
        if (!isFinite(ene)) ene = 0;
        if (sat <= 0 && thi <= 0 && nut <= 0 && ene <= 0) return false;

        var dur = Number(tpl.food_buff_duration_ticks);
        if (!isFinite(dur) || dur <= 0) dur = 10;
        dur = Math.max(1, Math.floor(dur));

        var buffId = 'buff_food_digest__' + itemId;
        if (typeof Buff.hasBuffByBuffId === 'function' && Buff.hasBuffByBuffId('player', buffId)) return false;

        var perTick = {
            satiety: sat > 0 ? sat / dur : 0,
            thirst: thi > 0 ? thi / dur : 0,
            nutrition: nut > 0 ? nut / dur : 0,
            energy: ene > 0 ? ene / dur : 0
        };
        var name = (tpl.sn || tpl.name || itemId);
        Buff.registerRuntimeBuffTemplate({
            buff_id: buffId,
            name: ui('scene.food.digesting_name', { name: name }),
            desc: ui('scene.food.digesting_desc'),
            durationTicks: dur,
            maxStacks: 1,
            stacksAddOnApply: 1,
            priority: 100,
            listenerSide: 'self',
            consumeMode: 'always',
            consumeLayersFixed: 0,
            applyMode: 'always_apply',
            triggerEventKind: ['world'],
            triggerEventName: ['tick_advanced'],
            triggerTags: ['time', 'tick'],
            effects: [{ type: 'survival_delta', params: perTick }],
            food_digest: true,
            judgment_tags: {
                food_item: itemId,
                meal_composition: tpl.meal_composition ? String(tpl.meal_composition).trim() : '',
                meal_tier: tpl.meal_tier ? String(tpl.meal_tier).trim() : ''
            }
        });
        return Buff.applyBuff('player', buffId, 'item:' + itemId, null);
    }

    /**
     * 应用物品模板的使用效果（edible/usable buff → 食物消化 → 生存量直加）。
     * 成功应用可食用/消化类后顺带 grantFoodAttributeExp（k79）。
     */
    function applyItemUseEffectFromTemplate(itemId, tpl) {
        var ue = tpl && tpl.use_effect;
        var Buff = global.BuffSystem;
        var edible = toBoolFlag(tpl ? tpl.edible : null);
        var edibleBuffId = tpl && tpl.edible_buff_id ? String(tpl.edible_buff_id).trim() : '';
        if (edible && edibleBuffId && Buff && typeof Buff.applyBuff === 'function') {
            if (typeof Buff.hasBuffByBuffId === 'function' && Buff.hasBuffByBuffId('player', edibleBuffId)) return false;
            var okEdible = Buff.applyBuff('player', edibleBuffId, 'item:' + itemId, null);
            if (okEdible) grantFoodAttributeExp(itemId, tpl);
            return okEdible;
        }
        var usable = toBoolFlag(tpl ? tpl.usable : null);
        var useBuffId = tpl && tpl.use_buff_id ? String(tpl.use_buff_id).trim() : '';
        if (usable && useBuffId && Buff && typeof Buff.applyBuff === 'function') {
            if (typeof Buff.hasBuffByBuffId === 'function' && Buff.hasBuffByBuffId('player', useBuffId)) return false;
            return Buff.applyBuff('player', useBuffId, 'item:' + itemId, null);
        }
        if (!ue || typeof ue !== 'object') return false;
        if ((tpl && tpl.category) === 'food') {
            var okFood = applyFoodDigestBuffFromTemplate(itemId, tpl);
            if (okFood) grantFoodAttributeExp(itemId, tpl);
            return okFood;
        }
        var Surv = global.Survival;
        if (!Surv) return false;
        var n;
        var any = false;
        if (ue.satiety != null && typeof Surv.addSatiety === 'function') {
            n = Number(ue.satiety);
            if (isFinite(n) && n !== 0) { Surv.addSatiety(n); any = true; }
        }
        if (ue.thirst != null && typeof Surv.addThirst === 'function') {
            n = Number(ue.thirst);
            if (isFinite(n) && n !== 0) { Surv.addThirst(n); any = true; }
        }
        if (ue.nutrition != null && typeof Surv.addNutrition === 'function') {
            n = Number(ue.nutrition);
            if (isFinite(n) && n !== 0) { Surv.addNutrition(n); any = true; }
        }
        if (ue.energy != null && typeof Surv.addEnergy === 'function') {
            n = Number(ue.energy);
            if (isFinite(n) && n !== 0) { Surv.addEnergy(n); any = true; }
        }
        return any;
    }

    /** k79：进食经验反馈文案（24 §24.5a 对齐餐位档 + 营养档位倍率）；供容器使用入口读取后清空。 */
    var lastFoodExpGrantText = '';

    /**
     * 进食属性经验（24 §24.5a）：meal_tier 档位基础 exp × 营养倍率 → CharacterAttributes.grantAttributeExp。
     * 苦力菜 workhorse≈0 直接跳过。结果写入 lastFoodExpGrantText 供食用反馈。
     */
    function grantFoodAttributeExp(itemId, tpl) {
        lastFoodExpGrantText = '';
        var CA = global.CharacterAttributes;
        var Surv = global.Survival;
        if (!CA || typeof CA.grantAttributeExp !== 'function' || !Surv || !tpl) {
            return { granted: false, reason: 'no_system' };
        }
        if (toBoolFlag(tpl.workhorse)) return { granted: false, reason: 'workhorse' };
        var tier = tpl.meal_tier ? String(tpl.meal_tier).trim() : '';
        if (!tier) return { granted: false, reason: 'no_meal_tier' };
        var expCfg = (typeof Surv.getConfigValue === 'function') ? Surv.getConfigValue('meal_exp_by_tier', null) : null;
        var base = (expCfg && expCfg[tier] != null) ? Number(expCfg[tier]) : 0;
        if (!isFinite(base) || !(base > 0)) return { granted: false, reason: 'no_base_exp' };
        var dimsCfg = (typeof Surv.getConfigValue === 'function') ? Surv.getConfigValue('meal_exp_dims_by_tier', null) : null;
        var dims = [];
        if (Array.isArray(tpl.attr_exp_grants) && tpl.attr_exp_grants.length) {
            dims = tpl.attr_exp_grants.slice();
        } else if (dimsCfg && Array.isArray(dimsCfg[tier])) {
            dims = dimsCfg[tier].slice();
        }
        if (!dims.length) return { granted: false, reason: 'no_dims' };
        var mult = (typeof Surv.getNutritionExpMultiplier === 'function') ? Number(Surv.getNutritionExpMultiplier()) : 1;
        if (!isFinite(mult) || mult <= 0) mult = 1;
        var grants = [];
        var i;
        for (i = 0; i < dims.length; i++) {
            var attrId = String(dims[i] || '').trim();
            if (!attrId) continue;
            grants.push({ attr_id: attrId, exp: Math.max(1, Math.round(base * mult)) });
        }
        if (!grants.length) return { granted: false, reason: 'no_dims' };
        var res = CA.grantAttributeExp('player', grants, { source: 'item.use.food', item_id: itemId, meal_tier: tier });
        var applied = (res && Array.isArray(res.applied)) ? res.applied : [];
        if (!applied.length) return { granted: false, reason: 'no_applied' };
        var parts = [];
        for (i = 0; i < applied.length; i++) {
            var a = applied[i] || {};
            var an = (typeof ui === 'function') ? ui('status.attr.' + String(a.attr_id || '')) : '';
            if (!an) an = String(a.attr_id || '');
            parts.push(an + '+' + String(a.exp_applied != null ? a.exp_applied : ''));
        }
        if (parts.length) lastFoodExpGrantText = '（' + parts.join(' ') + '）';
        return { granted: true, applied: applied };
    }

    /** 读取并清空上次进食经验反馈文案（原 scene-app tryUseItemFromContainer 的读后清语义）。 */
    function takeLastFoodExpGrantText() {
        var t = lastFoodExpGrantText;
        lastFoodExpGrantText = '';
        return t;
    }

    global.ItemUse = {
        setUiDeps: setUiDeps,
        toBoolFlag: toBoolFlag,
        itemTemplateIsConsumable: itemTemplateIsConsumable,
        applyFoodDigestBuffFromTemplate: applyFoodDigestBuffFromTemplate,
        applyItemUseEffectFromTemplate: applyItemUseEffectFromTemplate,
        grantFoodAttributeExp: grantFoodAttributeExp,
        takeLastFoodExpGrantText: takeLastFoodExpGrantText
    };
})(typeof window !== 'undefined' ? window : globalThis);
