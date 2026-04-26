(function (global) {
    'use strict';

    var table = {};
    var resolvers = {};

    function setTable(json) {
        table = {};
        if (!json || typeof json !== 'object') return;
        if (json.variants && typeof json.variants === 'object') {
            table = json.variants;
            return;
        }
        table = json;
    }

    function getVariant(id) {
        if (!id) return null;
        return table[String(id)] || null;
    }

    function getAllVariants() {
        var out = [];
        for (var k in table) {
            if (Object.prototype.hasOwnProperty.call(table, k) && table[k]) out.push(table[k]);
        }
        return out;
    }

    function registerVariantResolver(effectType, fn) {
        if (!effectType || typeof fn !== 'function') return;
        resolvers[String(effectType)] = fn;
    }

    function normalizeAssistScope(v) {
        var s = String(v || 'active_moves');
        if (s !== 'active_moves' && s !== 'parry' && s !== 'both') return 'active_moves';
        return s;
    }

    function scopeAllows(assistScope, targetKind) {
        var s = normalizeAssistScope(assistScope);
        if (s === 'both') return true;
        if (targetKind === 'active') return s === 'active_moves';
        if (targetKind === 'parry') return s === 'parry';
        return false;
    }

    function checkMoveFilters(v, ctx) {
        var tf = v && v.target_filters ? v.target_filters : null;
        if (!tf) return true;
        var moveId = String(ctx.moveId || '');
        var tags = Array.isArray(ctx.moveTags) ? ctx.moveTags : [];
        var dmgType = String(ctx.damageType || '');
        if (Array.isArray(tf.valid_move_ids) && tf.valid_move_ids.length && tf.valid_move_ids.indexOf(moveId) < 0) return false;
        if (Array.isArray(tf.invalid_move_ids) && tf.invalid_move_ids.length && tf.invalid_move_ids.indexOf(moveId) >= 0) return false;
        if (Array.isArray(tf.required_move_tags) && tf.required_move_tags.length) {
            for (var i = 0; i < tf.required_move_tags.length; i++) {
                if (tags.indexOf(String(tf.required_move_tags[i])) < 0) return false;
            }
        }
        if (Array.isArray(tf.valid_damage_types) && tf.valid_damage_types.length && tf.valid_damage_types.indexOf(dmgType) < 0) return false;
        var sIdx = ctx.subhit_index != null ? Number(ctx.subhit_index) : null;
        if (Array.isArray(tf.valid_subhit_indices) && tf.valid_subhit_indices.length) {
            if (sIdx == null || tf.valid_subhit_indices.indexOf(sIdx) < 0) return false;
        }
        if (tf.only_last_subhit === true && !ctx.is_last_subhit) return false;
        if (tf.only_first_subhit === true && sIdx !== 0) return false;
        return true;
    }

    function readPath(obj, path) {
        var cur = obj;
        for (var i = 0; i < path.length; i++) {
            if (!cur || typeof cur !== 'object') return undefined;
            cur = cur[path[i]];
        }
        return cur;
    }

    function evaluateTrigger(trigger, ctx) {
        if (!trigger) return true;
        if (Array.isArray(trigger.all_of) && trigger.all_of.length) {
            for (var i = 0; i < trigger.all_of.length; i++) {
                if (!evaluateTrigger(trigger.all_of[i], ctx)) return false;
            }
            return true;
        }
        if (Array.isArray(trigger.any_of) && trigger.any_of.length) {
            for (var j = 0; j < trigger.any_of.length; j++) {
                if (evaluateTrigger(trigger.any_of[j], ctx)) return true;
            }
            return false;
        }
        if (trigger.not) return !evaluateTrigger(trigger.not, ctx);
        if (trigger.path && trigger.op) {
            var v = readPath(ctx, String(trigger.path).split('.'));
            var rhs = trigger.value;
            switch (String(trigger.op)) {
                case 'eq': return v === rhs;
                case 'neq': return v !== rhs;
                case 'gte': return Number(v) >= Number(rhs);
                case 'gt': return Number(v) > Number(rhs);
                case 'lte': return Number(v) <= Number(rhs);
                case 'lt': return Number(v) < Number(rhs);
                case 'in': return Array.isArray(rhs) ? rhs.indexOf(v) >= 0 : false;
                default: return false;
            }
        }
        return true;
    }

    function mergeEffectParamsDeep(base, patch) {
        if (!patch || typeof patch !== 'object') return base;
        if (!base || typeof base !== 'object') {
            var o = {};
            for (var b2 in patch) { if (Object.prototype.hasOwnProperty.call(patch, b2)) o[b2] = patch[b2]; }
            return o;
        }
        var out = Object.assign({}, base);
        for (var k in patch) {
            if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
            if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
                out[k] = mergeEffectParamsDeep(base[k], patch[k]);
            } else {
                out[k] = patch[k];
            }
        }
        return out;
    }

    function computeVariantEffectiveLevel(v, getSkillLevelFn) {
        if (!v) return 0;
        var lb = v.level_basis;
        if (lb && typeof lb === 'object' && lb.skill_id) {
            var sid = String(lb.skill_id);
            var lv = (typeof getSkillLevelFn === 'function') ? (getSkillLevelFn(sid) || 0) : 0;
            var mult = lb.level_multiplier != null ? Number(lb.level_multiplier) : (lb.multiply != null ? Number(lb.multiply) : 1);
            var add = lb.level_add != null ? Number(lb.level_add) : (lb.add != null ? Number(lb.add) : 0);
            if (!isFinite(mult)) mult = 1;
            if (!isFinite(add)) add = 0;
            return lv * mult + add;
        }
        if (v.source_skill_id && typeof getSkillLevelFn === 'function') {
            return getSkillLevelFn(String(v.source_skill_id)) || 0;
        }
        return 0;
    }

    /**
     * @param {object} v 变式表条目
     * @param {{getSkillLevel:function(string):number, getMoveUsage:function(string):object, CombatSkills:object}} deps
     */
    function isVariantUnlocked(v, deps) {
        if (!v) return false;
        if (!checkVariantUnlockConditions(v, deps)) return false;
        var scope = String(v.assist_scope || 'active_moves');
        return scope === 'active_moves' || scope === 'parry' || scope === 'both';
    }

    function checkVariantUnlockConditions(v, deps) {
        var getSkillLevel = deps && typeof deps.getSkillLevel === 'function' ? deps.getSkillLevel : null;
        var getMoveUsage = deps && typeof deps.getMoveUsage === 'function' ? deps.getMoveUsage : null;
        var CS = deps && deps.CombatSkills;
        var uarr = v.unlock;
        if (!uarr || !Array.isArray(uarr) || uarr.length === 0) {
            var sid0 = v.source_skill_id ? String(v.source_skill_id) : '';
            var minL = parseInt(v.min_source_level, 10);
            if (!isFinite(minL)) minL = 0;
            if (sid0 && getSkillLevel) {
                if (getSkillLevel(sid0) < minL) return false;
            } else if (minL > 0 && !sid0) {
                return false;
            }
            return true;
        }
        for (var i = 0; i < uarr.length; i++) {
            var u = uarr[i];
            if (!u || !u.type) return false;
            if (u.type === 'skill_level_min') {
                var skL = String(u.skill_id || '');
                var needL = parseInt(u.level, 10);
                if (!isFinite(needL)) needL = 0;
                if (!getSkillLevel || (getSkillLevel(skL) || 0) < needL) return false;
            } else if (u.type === 'move_proficiency_ratio_min') {
                var ssk = String(u.skill_id || '');
                var mid = String(u.move_id || '');
                var needR = Number(u.ratio);
                if (!isFinite(needR)) return false;
                var mu = getMoveUsage && ssk ? getMoveUsage(ssk) : {};
                var cnt = (mu && mu[mid] != null) ? parseInt(mu[mid], 10) || 0 : 0;
                var pMax = u.proficiency_max_uses;
                var ratio = 0;
                if (CS && typeof CS.getProficiencyRatio === 'function') {
                    ratio = CS.getProficiencyRatio(cnt, pMax);
                } else if (CS && typeof CS.getMoveProficiencyRatio === 'function') {
                    ratio = CS.getMoveProficiencyRatio(cnt);
                } else {
                    return false;
                }
                if (ratio < needR) return false;
            } else {
                return false;
            }
        }
        return true;
    }

    function applyTemplateParamOverrides(v, paramPatch) {
        if (!v) return null;
        if (!paramPatch || typeof paramPatch !== 'object') {
            return v;
        }
        var out = {};
        for (var k in v) {
            if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = v[k];
        }
        out.variant_effect_params = mergeEffectParamsDeep(v.variant_effect_params || {}, paramPatch);
        return out;
    }

    function resolveLinearScale(v, ctx) {
        var srcLv = ctx.variant_effective_level != null ? Number(ctx.variant_effective_level) : Number(ctx.source_skill_level || 0);
        if (!isFinite(srcLv)) srcLv = 0;
        var spec = v && v.scale_params_by_source_level;
        if (!spec || typeof spec !== 'object') return 1;
        var minLv = Number(spec.min_level != null ? spec.min_level : 0);
        var maxLv = Number(spec.max_level != null ? spec.max_level : minLv);
        var minMul = Number(spec.min_multiplier != null ? spec.min_multiplier : 1);
        var maxMul = Number(spec.max_multiplier != null ? spec.max_multiplier : minMul);
        if (!isFinite(srcLv)) srcLv = 0;
        if (!isFinite(minLv)) minLv = 0;
        if (!isFinite(maxLv) || maxLv <= minLv) return minMul;
        var t = (srcLv - minLv) / (maxLv - minLv);
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        return minMul + (maxMul - minMul) * t;
    }

    function ensureCtxDefaults(ctx) {
        if (ctx.proficiencyDelta == null) ctx.proficiencyDelta = 1;
        if (!Array.isArray(ctx.appliedVariantIds)) ctx.appliedVariantIds = [];
    }

    function resolverPatchContextFields(ctx, v, scale) {
        var p = v && v.variant_effect_params ? v.variant_effect_params : {};
        var patch = p.patch_fields;
        if (!patch || typeof patch !== 'object') return;
        for (var k in patch) {
            if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
            var val = patch[k];
            if (typeof val === 'number') ctx[k] = val * scale;
            else ctx[k] = val;
        }
    }

    function resolverMultiplyRawDamage(ctx, v, scale) {
        var p = v && v.variant_effect_params ? v.variant_effect_params : {};
        var f = Number(p.factor_per_stack != null ? p.factor_per_stack : p.factor);
        if (!isFinite(f)) return;
        if (!isFinite(Number(ctx.rawDamage))) return;
        ctx.rawDamage = Number(ctx.rawDamage) * (f * scale);
    }

    function resolverAddRawDamage(ctx, v, scale) {
        var p = v && v.variant_effect_params ? v.variant_effect_params : {};
        var add = Number(p.delta != null ? p.delta : 0);
        if (!isFinite(add)) return;
        if (!isFinite(Number(ctx.rawDamage))) return;
        ctx.rawDamage = Number(ctx.rawDamage) + add * scale;
    }

    function resolverSetDamageType(ctx, v) {
        var p = v && v.variant_effect_params ? v.variant_effect_params : {};
        if (p.damage_type != null) ctx.damageType = String(p.damage_type);
    }

    function resolverProficiencyDeltaAdd(ctx, v, scale) {
        var p = v && v.variant_effect_params ? v.variant_effect_params : {};
        var d = Number(p.delta != null ? p.delta : 0);
        if (!isFinite(d)) return;
        ensureCtxDefaults(ctx);
        ctx.proficiencyDelta = Number(ctx.proficiencyDelta || 0) + d * scale;
    }

    function resolverProficiencyDeltaMul(ctx, v, scale) {
        var p = v && v.variant_effect_params ? v.variant_effect_params : {};
        var m = Number(p.multiplier != null ? p.multiplier : 1);
        if (!isFinite(m)) return;
        ensureCtxDefaults(ctx);
        ctx.proficiencyDelta = Number(ctx.proficiencyDelta || 0) * (m * scale);
    }

    registerVariantResolver('patch_context_fields', resolverPatchContextFields);
    registerVariantResolver('multiply_raw_damage', resolverMultiplyRawDamage);
    registerVariantResolver('add_raw_damage', resolverAddRawDamage);
    registerVariantResolver('set_damage_type', resolverSetDamageType);
    registerVariantResolver('proficiency_delta_add', resolverProficiencyDeltaAdd);
    registerVariantResolver('proficiency_delta_mul', resolverProficiencyDeltaMul);

    function runVariants(ctx, variantIds, targetKind) {
        if (!Array.isArray(variantIds) || !variantIds.length) return ctx;
        ensureCtxDefaults(ctx);
        var IE = global.InventoryEquipment;
        for (var i = 0; i < variantIds.length; i++) {
            var vid = String(variantIds[i] || '');
            if (!vid) continue;
            var v0 = getVariant(vid);
            if (!v0) continue;
            if (!scopeAllows(v0.assist_scope, targetKind)) continue;
            if (!checkMoveFilters(v0, ctx)) continue;
            var trig = v0.trigger || null;
            if (!evaluateTrigger(trig, ctx)) continue;
            var ovr = null;
            if (IE && typeof IE.getVariantEffectParamOverride === 'function') {
                ovr = IE.getVariantEffectParamOverride(vid);
            }
            var v = ovr ? applyTemplateParamOverrides(v0, ovr) : v0;
            var getSk = IE && typeof IE.getSkillLevel === 'function' ? function (sid) { return IE.getSkillLevel(String(sid || '')) || 0; } : function () { return 0; };
            var eff = computeVariantEffectiveLevel(v, getSk);
            ctx.variant_effective_level = eff;
            ctx.source_skill_level = eff;
            var scale = resolveLinearScale(v, ctx);
            var et = String(v.variant_effect_type || '');
            var fn = resolvers[et];
            if (typeof fn !== 'function') continue;
            fn(ctx, v, scale);
            ctx.appliedVariantIds.push(vid);
        }
        return ctx;
    }

    function applyToActiveContext(ctx) {
        var ids = (ctx.attacker && Array.isArray(ctx.attacker.activeVariantIds)) ? ctx.attacker.activeVariantIds : [];
        return runVariants(ctx, ids, 'active');
    }

    function applyToParryContext(ctx) {
        var ids = (ctx.defender && Array.isArray(ctx.defender.parryVariantIds)) ? ctx.defender.parryVariantIds : [];
        return runVariants(ctx, ids, 'parry');
    }

    global.CombatVariants = {
        setTable: setTable,
        getVariant: getVariant,
        getAllVariants: getAllVariants,
        registerVariantResolver: registerVariantResolver,
        applyToActiveContext: applyToActiveContext,
        applyToParryContext: applyToParryContext,
        isVariantUnlocked: isVariantUnlocked,
        computeVariantEffectiveLevel: function (v) {
            var IE = global.InventoryEquipment;
            var g = IE && typeof IE.getSkillLevel === 'function' ? function (s) { return IE.getSkillLevel(s) || 0; } : function () { return 0; };
            return computeVariantEffectiveLevel(v, g);
        },
        mergeEffectParamsForVariant: mergeEffectParamsDeep
    };
})(typeof window !== 'undefined' ? window : this);

