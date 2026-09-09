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
        // 47 §5.1：药水走 use_action 四途径（drink/topical/inhale/inject），需带药效核心 use_buff_id。
        var route = getUseActionRoute(tpl);
        if (route) {
            // 配药产出的动态注射液（47 §9.4）：药效来自实例 components，模板自身不带 use_buff_id。
            if (tpl.pharmacy_compound === true) return true;
            return !!(tpl.use_buff_id && String(tpl.use_buff_id).trim()) || !!(tpl.use_effect && typeof tpl.use_effect === 'object');
        }
        var usable = toBoolFlag(tpl.usable);
        if (usable && tpl.use_buff_id && String(tpl.use_buff_id).trim()) return true;
        var ue = tpl.use_effect;
        return !!(ue && typeof ue === 'object');
    }

    // ---------------------------
    // 给药途径（47 §3.2/§5）：use_action 四途径分流
    // ---------------------------
    var USE_ACTION_IDS = ['drink', 'topical', 'inhale', 'inject'];
    /** 七部位（09；与 scene-app BODY_PART_IDS 同源）。 */
    var BODY_PART_IDS = ['head', 'chest', 'belly', 'lhand', 'rhand', 'lfoot', 'rfoot'];

    /** 最近一次使用失败的结构化原因（供 UI 取文案后清空）。 */
    var lastUseFailure = null;
    /** 外敷目标部位登记表：buffId → partId（供部位恢复类效果读取；同一 buff 重复使用取最近一次）。 */
    var topicalPartByBuffId = {};

    /** 读物品模板的给药途径（无/非法返回 ''）。 */
    function getUseActionRoute(tpl) {
        var raw = tpl && tpl.use_action != null ? String(tpl.use_action).trim().toLowerCase() : '';
        if (!raw) return '';
        return USE_ACTION_IDS.indexOf(raw) >= 0 ? raw : '';
    }

    /** 途径白名单校验（有 PharmacyConfig 时以 pharmacy-system-config.csv 为准）。 */
    function isUseRouteAllowed(routeId) {
        var rid = routeId != null ? String(routeId).trim().toLowerCase() : '';
        if (!rid) return false;
        var PC = global.PharmacyConfig;
        if (PC && typeof PC.isUseRouteAllowed === 'function' && global.PharmacyStation && typeof global.PharmacyStation.getSystemConfig === 'function') {
            return PC.isUseRouteAllowed(rid, global.PharmacyStation.getSystemConfig());
        }
        return USE_ACTION_IDS.indexOf(rid) >= 0;
    }

    /** 从配置读取「某途径所需的物品 id 列表」（空表 = 不校验）。吸入不需火源（2026-09 裁决）。 */
    function getRequiredItemIdsForRoute(routeId) {
        var PS = global.PharmacyStation;
        var cfg = (PS && typeof PS.getSystemConfig === 'function') ? PS.getSystemConfig() : null;
        if (!cfg) return [];
        var key = (routeId === 'inject') ? 'pharmacy_inject_kit_item_ids' : '';
        if (!key) return [];
        var list = cfg[key];
        return Array.isArray(list) ? list : [];
    }

    function hasAnyItemInInventory(itemIds) {
        if (!Array.isArray(itemIds) || !itemIds.length) return true;
        var IH = global.InventoryHelpers;
        var i;
        for (i = 0; i < itemIds.length; i++) {
            var id = itemIds[i] != null ? String(itemIds[i]).trim() : '';
            if (!id) continue;
            if (IH && typeof IH.getInventoryCountByItemId === 'function' && IH.getInventoryCountByItemId(id) > 0) return true;
        }
        return false;
    }

    function failUse(reason, detail) {
        lastUseFailure = { reason: reason, detail: detail || null };
        return false;
    }

    /** 读取并清空最近一次使用失败原因。 */
    function takeLastUseFailure() {
        var f = lastUseFailure;
        lastUseFailure = null;
        return f;
    }

    /** 外敷目标部位（无登记返回 ''）。 */
    function getTopicalPartForBuff(buffId) {
        var bid = buffId != null ? String(buffId) : '';
        return bid && topicalPartByBuffId[bid] ? String(topicalPartByBuffId[bid]) : '';
    }

    /** 清空外敷部位登记（新档/重置用）。 */
    function clearTopicalParts() {
        topicalPartByBuffId = {};
    }

    /** 从任一容器消耗 1 件指定物品（针具/消毒剂）。 */
    function consumeOneItem(itemId) {
        var id = itemId != null ? String(itemId).trim() : '';
        if (!id) return false;
        var IH = global.InventoryHelpers;
        var IE = global.InventoryEquipment;
        if (!IH || typeof IH.findFirstContainerSlotByItemId !== 'function') return false;
        if (!IE || typeof IE.takeItemFromContainer !== 'function') return false;
        var slot = IH.findFirstContainerSlotByItemId(id);
        if (!slot) return false;
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        return !!(taken && taken.success && taken.item);
    }

    /**
     * 针具卫生门槛（47 §5.2/§8，k244）：
     *   优先消耗一次性器具（输液器）→ 卫生达标；
     *   否则消耗一份消毒剂（酒）→ 卫生达标；
     *   两样都没有 → 仍可注射，但本次额外注入「针具不洁」感染毒性。
     */
    function resolveInjectionHygiene() {
        var PS = global.PharmacyStation;
        var cfg = (PS && typeof PS.getSystemConfig === 'function') ? PS.getSystemConfig() : null;
        var disposables = (cfg && Array.isArray(cfg.pharmacy_disposable_kit_item_ids)) ? cfg.pharmacy_disposable_kit_item_ids : [];
        var sterilizers = (cfg && Array.isArray(cfg.pharmacy_sterilizer_item_ids)) ? cfg.pharmacy_sterilizer_item_ids : [];
        var penalty = (cfg && cfg.pharmacy_dirty_injection_toxicity != null) ? Number(cfg.pharmacy_dirty_injection_toxicity) : 8;
        if (!isFinite(penalty) || penalty < 0) penalty = 0;
        var i;
        for (i = 0; i < disposables.length; i++) {
            if (consumeOneItem(disposables[i])) return { ok: true, mode: 'disposable', consumed: String(disposables[i]), penalty_toxicity: 0 };
        }
        for (i = 0; i < sterilizers.length; i++) {
            if (consumeOneItem(sterilizers[i])) return { ok: true, mode: 'sterilized', consumed: String(sterilizers[i]), penalty_toxicity: 0 };
        }
        return { ok: true, mode: 'dirty', consumed: '', penalty_toxicity: penalty };
    }

    /** 最近一次注射的卫生状态（供 UI/日志读取）。 */
    var lastInjectionHygiene = null;
    function takeLastInjectionHygiene() {
        var h = lastInjectionHygiene;
        lastInjectionHygiene = null;
        return h;
    }

    /** 注射后卫生结算：不洁针具额外注入感染毒性。 */
    function applyInjectionHygiene(hygiene) {
        lastInjectionHygiene = hygiene || null;
        if (!hygiene || !(hygiene.penalty_toxicity > 0)) return 0;
        var PE = global.PharmacyEffects;
        if (PE && typeof PE.addToxicity === 'function') {
            PE.addToxicity(hygiene.penalty_toxicity);
            return hygiene.penalty_toxicity;
        }
        return 0;
    }

    /**
     * 按 use_action 途径结算一次使用（47 §5.1/§5.2）。
     * opts.part_id：外敷必填（七部位之一）；opts.silent：不产生失败原因记录以外的副作用。
     * 成功：挂 use_buff_id 对应 buff（±use_effect 生存量），外敷登记目标部位，返回 true。
     */
    function applyUseActionRoute(itemId, tpl, route, opts) {
        var options = opts && typeof opts === 'object' ? opts : {};
        var rid = route != null ? String(route).trim().toLowerCase() : '';
        if (!rid) return failUse('no_route');
        if (!isUseRouteAllowed(rid)) return failUse('route_not_allowed', rid);

        var partId = '';
        var hygiene = null;
        if (rid === 'topical') {
            partId = options.part_id != null ? String(options.part_id).trim() : '';
            if (!partId) return failUse('needs_part');
            if (BODY_PART_IDS.indexOf(partId) < 0) return failUse('bad_part', partId);
        }
        if (rid === 'inject') {
            if (!hasAnyItemInInventory(getRequiredItemIdsForRoute('inject'))) return failUse('needs_inject_kit');
            // 针具卫生（k244）：一次性器具/消毒剂优先，否则本次带感染毒性
            hygiene = resolveInjectionHygiene();
        }

        var Buff = global.BuffSystem;
        // 配药注射液（47 §9.4）：一次滴注按实例成分结算（多族 buff + 净毒性 + 相冲 + 成瘾）
        if (rid === 'inject' && tpl && tpl.pharmacy_compound === true) {
            var PC = global.PharmacyCompounding;
            var inst = options.instance && typeof options.instance === 'object' ? options.instance : null;
            if (!PC || typeof PC.applyInjection !== 'function') return failUse('compounding_unavailable');
            if (!inst || !Array.isArray(inst.components) || !inst.components.length) return failUse('no_components');
            var inj = PC.applyInjection(inst, {});
            if (!inj || inj.ok !== true) return failUse(inj && inj.reason ? inj.reason : 'compound_failed');
            applyInjectionHygiene(hygiene);
            lastUseFailure = null;
            return true;
        }
        var buffId = tpl && tpl.use_buff_id ? String(tpl.use_buff_id).trim() : '';
        var buffIds = [];
        if (tpl && Array.isArray(tpl.use_buff_ids)) {
            var bi;
            for (bi = 0; bi < tpl.use_buff_ids.length; bi++) {
                var bid = tpl.use_buff_ids[bi] != null ? String(tpl.use_buff_ids[bi]).trim() : '';
                if (bid) buffIds.push(bid);
            }
        } else if (buffId) {
            buffIds.push(buffId);
        }
        var applied = false;
        if (buffIds.length && Buff && typeof Buff.applyBuff === 'function') {
            var ai;
            var appliedIds = [];
            for (ai = 0; ai < buffIds.length; ai++) {
                var oneId = buffIds[ai];
                if (typeof Buff.hasBuffByBuffId === 'function' && Buff.hasBuffByBuffId('player', oneId)) continue;
                var okOne = Buff.applyBuff('player', oneId, 'item:' + itemId, {
                    route: rid,
                    part_id: partId || null,
                    item_id: itemId
                }) === true;
                if (okOne) appliedIds.push(oneId);
            }
            if (appliedIds.length) {
                applied = true;
                if (rid === 'topical') {
                    for (ai = 0; ai < appliedIds.length; ai++) topicalPartByBuffId[appliedIds[ai]] = partId;
                }
            } else if (buffIds.length) {
                // 全部已在生效中：与旧 edible/usable 口径一致，视为本次使用失败（不叠 buff）。
                return failUse('already_active', buffIds.join('|'));
            }
        }

        var ue = tpl && tpl.use_effect && typeof tpl.use_effect === 'object' ? tpl.use_effect : null;
        if (ue) {
            if ((tpl && tpl.category) === 'food') {
                if (applyFoodDigestBuffFromTemplate(itemId, tpl)) applied = true;
            } else {
                var Surv = global.Survival;
                var n;
                if (Surv) {
                    if (ue.satiety != null && typeof Surv.addSatiety === 'function') {
                        n = Number(ue.satiety); if (isFinite(n) && n !== 0) { Surv.addSatiety(n); applied = true; }
                    }
                    if (ue.thirst != null && typeof Surv.addThirst === 'function') {
                        n = Number(ue.thirst); if (isFinite(n) && n !== 0) { Surv.addThirst(n); applied = true; }
                    }
                    if (ue.nutrition != null && typeof Surv.addNutrition === 'function') {
                        n = Number(ue.nutrition); if (isFinite(n) && n !== 0) { Surv.addNutrition(n); applied = true; }
                    }
                    if (ue.energy != null && typeof Surv.addEnergy === 'function') {
                        n = Number(ue.energy); if (isFinite(n) && n !== 0) { Surv.addEnergy(n); applied = true; }
                    }
                }
            }
        }
        if (!applied) return failUse(buffId ? 'buff_apply_failed' : 'no_effect', buffId);
        if (rid === 'inject') applyInjectionHygiene(hygiene);
        lastUseFailure = null;
        return true;
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
    function applyItemUseEffectFromTemplate(itemId, tpl, opts) {
        // 47 §5.1：声明了 use_action 的物品走途径分流（药水/药膏/药烟/注射液）。
        var route = getUseActionRoute(tpl);
        if (route) return applyUseActionRoute(itemId, tpl, route, opts);
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
        USE_ACTION_IDS: USE_ACTION_IDS,
        BODY_PART_IDS: BODY_PART_IDS,
        getUseActionRoute: getUseActionRoute,
        isUseRouteAllowed: isUseRouteAllowed,
        applyUseActionRoute: applyUseActionRoute,
        resolveInjectionHygiene: resolveInjectionHygiene,
        takeLastInjectionHygiene: takeLastInjectionHygiene,
        takeLastUseFailure: takeLastUseFailure,
        getTopicalPartForBuff: getTopicalPartForBuff,
        clearTopicalParts: clearTopicalParts,
        applyFoodDigestBuffFromTemplate: applyFoodDigestBuffFromTemplate,
        applyItemUseEffectFromTemplate: applyItemUseEffectFromTemplate,
        grantFoodAttributeExp: grantFoodAttributeExp,
        takeLastFoodExpGrantText: takeLastFoodExpGrantText
    };
})(typeof window !== 'undefined' ? window : globalThis);
