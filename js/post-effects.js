/**
 * 后遗症数据层（与战斗管线解耦）
 * 数据源：data/post-effects.json。设计见 docs/design/11-skills.md、14-implementation.md、07-combat-core.md。
 * 运行时解析器与管线挂钩仍在 js/combat-post-effects.js（CombatPostEffects）。
 */
(function (global) {
    'use strict';

    var table = {};

    /**
     * @param {object} json post-effects.json 根对象（可含 _comment）
     */
    function setTable(json) {
        table = {};
        if (!json || typeof json !== 'object') return;
        for (var k in json) {
            if (!Object.prototype.hasOwnProperty.call(json, k) || k === '_comment') continue;
            var row = json[k];
            if (!row || typeof row !== 'object') continue;
            var id = row.id != null ? String(row.id).trim() : '';
            if (!id) continue;
            if (k !== id) {
                if (global.console && typeof global.console.warn === 'function') {
                    global.console.warn('[PostEffects] 顶层键与条目 id 不一致：', k, '→', id);
                }
            }
            table[id] = row;
        }
    }

    function getPostEffect(id) {
        if (id == null || id === '') return null;
        return table[String(id)] || null;
    }

    function getAllPostEffects() {
        var out = [];
        for (var k in table) {
            if (Object.prototype.hasOwnProperty.call(table, k) && table[k]) out.push(table[k]);
        }
        return out;
    }

    function getPostEffectIds() {
        return Object.keys(table).sort();
    }

    /**
     * 装配 / 运行时：仅当条目含非空 valid_skill_ids / valid_move_ids 时才限制。
     * @param {object} pe 后遗症条目
     * @param {{ skillId?: string, moveId?: string }} ctx
     */
    function validateSocket(pe, ctx) {
        if (!pe) return false;
        ctx = ctx || {};
        var sk = ctx.skillId != null ? String(ctx.skillId) : '';
        var mv = ctx.moveId != null ? String(ctx.moveId) : '';
        if (Array.isArray(pe.valid_skill_ids) && pe.valid_skill_ids.length && sk && pe.valid_skill_ids.indexOf(sk) < 0) return false;
        if (Array.isArray(pe.valid_move_ids) && pe.valid_move_ids.length && mv && pe.valid_move_ids.indexOf(mv) < 0) return false;
        return true;
    }

    global.PostEffects = {
        setTable: setTable,
        getPostEffect: getPostEffect,
        getAllPostEffects: getAllPostEffects,
        getPostEffectIds: getPostEffectIds,
        validateSocket: validateSocket
    };
})(typeof window !== 'undefined' ? window : this);
