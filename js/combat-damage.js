/** Design 49: pure per-segment damage arithmetic. No RNG or world mutation. */
(function (global) {
    'use strict';
    var TYPES = ['blunt', 'slash', 'pierce'];
    function number(v, fallback) { return isFinite(Number(v)) ? Number(v) : (fallback || 0); }
    function empty() { return { blunt: 0, slash: 0, pierce: 0 }; }
    function total(t) { return TYPES.reduce(function (s, k) { return s + Math.max(0, number(t && t[k])); }, 0); }
    function scale(t, m) {
        var out = empty();
        TYPES.forEach(function (k) { out[k] = Math.max(0, number(t && t[k]) * m); });
        return out;
    }
    function basePower(s) {
        s = Math.max(0, number(s));
        return s <= 150 ? s * 0.7 : 105 + 220 * (1 - Math.exp(-(s - 150) / 450));
    }
    function attack(p) {
        var growth = Math.max(0, 1 + number(p.levelBonus) + number(p.proficiencyBonus) + number(p.innateBonus) + number(p.experienceBonus));
        return Math.max(0, number(p.base) * growth * number(p.move, 1) * number(p.power, 1) * number(p.breath, 1));
    }
    function addPath(path, type) { return path.indexOf(type) < 0 ? path.concat([type]) : path.slice(); }
    function componentsToTyped(parts, inc) {
        var out = empty();
        parts.forEach(function (p) {
            var seen = {};
            var value = p.amount;
            p.path.forEach(function (t) {
                if (seen[t]) return;
                seen[t] = true;
                value *= Math.max(0, 1 + number(inc && inc[t]));
            });
            out[p.type] += value;
        });
        return out;
    }
    function typed(base, effects) {
        effects = effects || {};
        var snapshot = empty();
        var parts = [];
        TYPES.forEach(function (t) {
            snapshot[t] = Math.max(0, number(base && base[t]) + number(effects.add_flat && effects.add_flat[t]));
            if (snapshot[t]) parts.push({ type: t, amount: snapshot[t], path: [t] });
        });
        (effects.add_from_pct || []).forEach(function (e) {
            if (TYPES.indexOf(e.source) < 0 || TYPES.indexOf(e.target) < 0) return;
            parts.push({ type: e.target, amount: snapshot[e.source] * Math.max(0, number(e.pct)), path: addPath([e.source], e.target) });
        });
        var injected = componentsToTyped(parts, {});
        var inc1 = componentsToTyped(parts, effects.increase_pct);
        var c = effects.convert_pct || {};
        var converted = [];
        parts.forEach(function (p) {
            if (p.type !== 'blunt') { converted.push(p); return; }
            var toSlash = Math.min(p.amount, p.amount * Math.max(0, number(c.blunt_to_slash)));
            var toPierce = Math.min(p.amount - toSlash, p.amount * Math.max(0, number(c.blunt_to_pierce)));
            converted.push({ type: 'blunt', amount: p.amount - toSlash - toPierce, path: p.path });
            converted.push({ type: 'slash', amount: toSlash, path: addPath(p.path, 'slash') });
            converted.push({ type: 'pierce', amount: toPierce, path: addPath(p.path, 'pierce') });
        });
        parts = [];
        converted.forEach(function (p) {
            if (p.type !== 'slash') { parts.push(p); return; }
            var moved = Math.min(p.amount, p.amount * Math.max(0, number(c.slash_to_pierce)));
            parts.push({ type: 'slash', amount: p.amount - moved, path: p.path });
            parts.push({ type: 'pierce', amount: moved, path: addPath(p.path, 'pierce') });
        });
        return { typedDamage: componentsToTyped(parts, effects.increase_pct), components: parts,
            stages: { initial: scale(base, 1), afterInject: injected, afterIncrease1: inc1,
                afterConvert: componentsToTyped(parts, {}), afterIncrease2: componentsToTyped(parts, effects.increase_pct) } };
    }
    function defend(input, p) {
        p = p || {};
        var t = scale(input, 1 - Math.max(0, Math.min(1, number(p.unload))));
        var ideal = empty();
        TYPES.forEach(function (k) { ideal[k] = t[k] * Math.max(0, Math.min(0.95, number(p.armor && p.armor[k]))); });
        var wanted = total(ideal);
        var budget = p.permanentArmor ? wanted : Math.max(0, number(p.shield));
        var fraction = wanted > 0 ? Math.min(1, budget / wanted) : 0;
        TYPES.forEach(function (k) { t[k] -= ideal[k] * fraction; });
        var afterArmor = scale(t, 1);
        var D = total(t), flexibility = Math.max(0, number(p.flexibility));
        t = scale(t, D > 0 ? 3 * D / (flexibility + 3 * D) : 0);
        var afterFlex = scale(t, 1);
        TYPES.forEach(function (k) { t[k] *= Math.max(0, number(p.part && p.part[k], 1)); });
        return { typed: t, damage: total(t), absorbed: wanted * fraction,
            shieldRemaining: p.permanentArmor ? number(p.shield) : Math.max(0, budget - wanted * fraction),
            afterArmor: afterArmor, afterFlex: afterFlex };
    }
    /** Conditions are explicit data. Unknown checks fail closed. */
    function condition(check, state) {
        check = check || { type: 'always' };
        if (typeof check === 'string') check = { type: check };
        var q = number(state.qi), max = number(state.max);
        switch (check.type) {
            case 'always': return true;
            case 'full': return max > 0 && q >= max;
            case 'empty': return q <= 0;
            case 'ratio_at_least': return max > 0 && q / max >= number(check.value);
            case 'ratio_at_most': return max > 0 && q / max <= number(check.value);
            case 'pay_move_cost': return q >= number(state.cost);
            default: return false;
        }
    }
    function breath(bar, qi, max, cost, restore) {
        bar = bar || {};
        var rules = bar.damage_states || [];
        var selected = null;
        for (var i = 0; i < rules.length; i++) {
            if (condition(rules[i].when, { qi: qi, max: max, cost: cost })) { selected = rules[i]; break; }
        }
        var u = bar.usage_conditions || {};
        var satisfied = condition(u.check || 'pay_move_cost', { qi: qi, max: max, cost: cost });
        var branch = satisfied ? u.on_satisfied : u.on_unsatisfied;
        if (typeof branch === 'string') branch = { mode: branch };
        branch = branch || { mode: satisfied ? 'normal' : 'damage_zero_drain_zero' };
        var multiplier = selected ? number(selected.multiplier, 1) : 1;
        if (branch.damage_multiplier != null) multiplier *= Math.max(0, number(branch.damage_multiplier));
        var zero = branch.damage_result === 'zero' || branch.damage_multiplier === 0 || (!satisfied && branch.mode === 'damage_zero_drain_zero');
        return { multiplier: zero ? 0 : Math.max(0, multiplier), forceZero: zero,
            blockTargetEffects: !!branch.block_target_effects || !!(selected && selected.block_target_effects),
            consume: selected && selected.consume_all ? Math.max(0, qi) : cost,
            restore: selected && selected.consume_all ? 0 : (selected && selected.gain_after_attack != null ? Math.max(0, number(selected.gain_after_attack)) : restore),
            drain: branch.qi_li_drain === 'to_zero' || (!satisfied && branch.mode === 'damage_zero_drain_zero'),
            extraDiqi: Math.max(0, number(branch.diqi_cost)), stateId: selected && selected.id || null };
    }
    global.CombatDamage = { types: TYPES, total: total, scale: scale, basePower: basePower, attack: attack, typed: typed, defend: defend, breath: breath };
})(typeof window !== 'undefined' ? window : this);
