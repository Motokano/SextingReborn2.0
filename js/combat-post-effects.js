/**
 * 后遗症（post-effects.json）分派：按 effect_type 注册解析器，供 combat-pipeline 阶段调用。
 * 新增 effect_type：在此 registerPostEffectResolver，并在 data/combat-pipeline.json effect_type_catalog 登记。
 */
(function (global) {
    'use strict';

    var table = {};
    var customResolvers = {};

    function setTable(json) {
        table = {};
        if (!json || typeof json !== 'object') return;
        for (var k in json) {
            if (!json.hasOwnProperty(k) || k === '_comment') continue;
            var row = json[k];
            if (row && typeof row === 'object' && row.id) table[row.id] = row;
        }
    }

    function getPostEffect(id) {
        return id ? table[id] : null;
    }

    function registerPostEffectResolver(effectType, fn) {
        if (effectType && typeof fn === 'function') customResolvers[effectType] = fn;
    }

    function validateSocket(pe, ctx) {
        if (!pe) return false;
        if (pe.valid_skill_ids && pe.valid_skill_ids.length && ctx.skillId && pe.valid_skill_ids.indexOf(ctx.skillId) < 0) return false;
        if (pe.valid_move_ids && pe.valid_move_ids.length && ctx.moveId && pe.valid_move_ids.indexOf(ctx.moveId) < 0) return false;
        return true;
    }

    /**
     * @param {object} ctx 管线上下文
     * @param {string} hook 如 hit_roll_success
     */
    function runPostEffectsForHook(ctx, hook) {
        var ids = (ctx.attacker && ctx.attacker.postEffectIds) ? ctx.attacker.postEffectIds : [];
        if (!ids.length) return;
        var ii;
        for (ii = 0; ii < ids.length; ii++) {
            var pe = getPostEffect(ids[ii]);
            if (!validateSocket(pe, ctx)) continue;
            var trig = (pe.effect_params && pe.effect_params.trigger) ? pe.effect_params.trigger : 'hit_roll_success';
            if (trig !== hook) continue;
            if (hook === 'hit_roll_success' && !ctx.hitRollSuccess) continue;
            if (hook === 'hit_roll_success' && ctx.parrySucceeded && !(pe.effect_params && pe.effect_params.apply_when_parry_zero_damage)) continue;
            var fn = customResolvers[pe.effect_type];
            if (fn) {
                try { fn(ctx, pe); } catch (e) { /* ignore */ }
            }
        }
    }

    function resolverDispelStub(ctx, pe) {
        if (global.GameLog && typeof global.GameLog.log === 'function') {
            var msg = '[后遗症] ' + (pe.id || '') + '（驱散类，待接 BuffSystem 候选池）';
            global.GameLog.log(msg, 'info');
        }
    }

    function resolverInitiativeNoop(ctx, pe) {
        /* 先手在 07 速度比较前查询装配；管线内不重复处理 */
    }

    registerPostEffectResolver('dispel_one_beneficial_buff_on_target', resolverDispelStub);
    registerPostEffectResolver('initiative_always_first', resolverInitiativeNoop);

    global.CombatPostEffects = {
        setTable: setTable,
        getPostEffect: getPostEffect,
        registerPostEffectResolver: registerPostEffectResolver,
        runPostEffectsForHook: runPostEffectsForHook
    };
})(typeof window !== 'undefined' ? window : this);
