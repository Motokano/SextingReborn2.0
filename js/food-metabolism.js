/** FoodMetabolism: deterministic per-portion digestion; shared by runtime and balance tests. */
(function (root) {
    'use strict';
    function fresh() { return { version: 1, portions: [], diet: [0, 0, 0, 0], pendingStamina: 0, expRemainders: {}, weightRemainder: 0 }; }
    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function restore(x) {
        if (!x || x.version !== 1) return fresh();
        var s = clone(x);
        s.portions = (s.portions || []).filter(function (p) { return p.remaining > 0 && p.profile && p.profile.digestion_ticks > 0; });
        s.diet = s.diet || [0, 0, 0, 0];
        s.expRemainders = s.expRemainders || {};
        s.pendingStamina = Math.max(0, Number(s.pendingStamina) || 0);
        s.weightRemainder = Number(s.weightRemainder) || 0;
        return s;
    }
    function eat(s, itemId, profile) {
        if (!profile || !(profile.digestion_ticks > 0) || !(profile.satiety_total >= 0)) return false;
        s.portions.push({ item_id: itemId, profile: clone(profile), remaining: profile.digestion_ticks });
        return true;
    }
    function balance(diet, cfg) {
        var total = diet.reduce(function (a, b) { return a + b; }, 0);
        var shares = diet.map(function (x) { return total > 0 ? x / total : 0; });
        var min = cfg.balance_min_share, max = cfg.balance_max_share;
        var count = shares.slice(0, 3).filter(function (x) { return x >= min; }).length;
        var level = count === 3 && shares.slice(0, 3).every(function (x) { return x <= max; }) ? 'balanced' : count >= 2 ? 'mixed' : 'single';
        return { level: level, count: count, categories: ['staple', 'meat', 'veg'].filter(function (_, i) { return shares[i] >= min; }), shares: shares };
    }
    function multiplier(n, cfg) { return n >= 71 ? cfg.exp_mult.peak : n >= 31 ? cfg.exp_mult.abundant : n >= 11 ? cfg.exp_mult.normal : cfg.exp_mult.malnutrition; }
    function tick(s, body, cfg) {
        var intake = 0, exp = {}, composition = [0, 0, 0, 0];
        var mult = multiplier(body.nutrition, cfg);
        s.portions.forEach(function (p) {
            var f = p.profile, fraction = 1 / f.digestion_ticks;
            intake += f.satiety_total * fraction;
            f.composition.forEach(function (x, i) { composition[i] += x * f.portion_units * fraction; });
            Object.keys(f.attribute_exp).forEach(function (dim) { exp[dim] = (exp[dim] || 0) + f.attribute_exp[dim] * fraction * mult; });
            p.remaining -= 1;
        });
        s.portions = s.portions.filter(function (p) { return p.remaining > 0; });
        var decay = Math.exp(-1 / cfg.diet_memory_ticks);
        s.diet = s.diet.map(function (x, i) { return x * decay + composition[i]; });
        var info = balance(s.diet, cfg);
        var target = cfg.nutrition_targets[info.level];
        // Empty history and prolonged fasting cannot maintain nutrition by remembered variety alone.
        var foodRate = s.diet.reduce(function (a, b) { return a + b; }, 0) / cfg.diet_memory_ticks;
        target *= Math.min(1, foodRate / cfg.nutrition_min_portions_per_tick);
        var rate = target > body.nutrition ? cfg.nutrition_rise_per_tick : cfg.nutrition_fall_per_tick;
        var nutrition = body.nutrition + Math.max(-rate, Math.min(rate, target - body.nutrition));
        var expenditure = cfg.base_expenditure + s.pendingStamina * cfg.stamina_expenditure;
        s.pendingStamina = 0;
        var reserve = body.satiety + intake - expenditure;
        var surplus = Math.max(0, reserve - cfg.satiety_cap);
        reserve = Math.min(cfg.satiety_cap, reserve);
        var stored = Math.max(0, reserve - cfg.storage_threshold) * cfg.storage_rate;
        reserve -= stored;
        var deltaKg = (surplus + stored) / cfg.surplus_per_kg;
        var baseline = cfg.maintenance_bmi * Math.pow(body.height_cm / 100, 2);
        var exactWeight = body.weight_kg + s.weightRemainder;
        if (reserve < cfg.fat_release_threshold && exactWeight + deltaKg > baseline) {
            var release = Math.min(cfg.fat_release_threshold - reserve, (exactWeight + deltaKg - baseline) * cfg.deficit_per_kg);
            reserve += release;
            deltaKg -= release / cfg.deficit_per_kg;
        }
        // Below the maintenance body size, only genuinely depleted reserves cause further loss.
        if (reserve < 0) deltaKg += reserve / cfg.starvation_deficit_per_kg;
        var nextExact = Math.max(1, exactWeight + deltaKg);
        var weight = Math.round(nextExact * 10) / 10;
        s.weightRemainder = nextExact - weight;
        var grants = [];
        Object.keys(exp).forEach(function (dim) {
            var total = (s.expRemainders[dim] || 0) + exp[dim];
            var whole = Math.floor(total + 1e-9);
            s.expRemainders[dim] = total - whole;
            if (whole > 0) grants.push({ attr_id: dim, exp: whole });
        });
        return { satiety: Math.max(0, reserve), nutrition: nutrition, weight_kg: weight, grants: grants, balance: info, intake: intake, expenditure: expenditure, surplus: surplus + stored };
    }
    function migrateLegacy(buffState, getItem, nowTick) {
        var s = fresh();
        var instances = buffState && buffState.instancesByOwner && buffState.instancesByOwner.player || [];
        instances.forEach(function (inst) {
            var source = String(inst.source_id || '');
            if (source.indexOf('item:') !== 0) return;
            var id = source.slice(5), tpl = getItem(id);
            if (!tpl || !tpl.food_profile || inst.buff_id !== tpl.edible_buff_id) return;
            var duration = Math.max(1, inst.expires_at_tick - inst.started_tick);
            var fraction = Math.max(0, Math.min(1, (inst.expires_at_tick - nowTick) / duration));
            if (!fraction) return;
            var f = clone(tpl.food_profile);
            // Legacy meals granted experience at ingestion. Do not grant it a second time.
            f.attribute_exp = {};
            eat(s, id, f);
            s.portions[s.portions.length - 1].remaining = Math.max(1, Math.floor(f.digestion_ticks * fraction));
        });
        return s;
    }
    root.FoodMetabolism = { fresh: fresh, restore: restore, eat: eat, tick: tick, balance: balance, migrateLegacy: migrateLegacy };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.FoodMetabolism;
})(typeof window !== 'undefined' ? window : globalThis);
