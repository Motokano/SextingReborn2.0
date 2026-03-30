/**
 * 敌人战斗模板：招架默认值、是否可反击、部位是否吃损毁（测试木桩可 invulnerable）。
 * 数据：data/combat-enemies.json
 */
(function (global) {
    'use strict';

    var table = { enemies: {} };

    function setTable(obj) {
        if (!obj || typeof obj !== 'object') return;
        table.enemies = obj.enemies && typeof obj.enemies === 'object' ? obj.enemies : {};
    }

    function clamp01(x) {
        return Math.max(0, Math.min(1, x));
    }

    function getById(enemyId) {
        if (!enemyId) return null;
        var e = table.enemies[enemyId];
        return e && typeof e === 'object' ? e : null;
    }

    /**
     * 合并到管线 ctx.defender（kind 已为 enemy 时调用）。
     */
    function mergeIntoDefender(defender) {
        if (!defender || defender.kind !== 'enemy') return defender;
        var t = getById(defender.enemyId);
        if (!t) {
            if (defender.speed == null || !isFinite(Number(defender.speed))) defender.speed = 10;
            if (defender.inner_damage_reduce == null) defender.inner_damage_reduce = 0;
            if (defender.body_damage_reduce == null) defender.body_damage_reduce = 0;
            return defender;
        }
        if (t.parry_rate != null) defender.parry_rate = Number(t.parry_rate);
        if (t.parry_damage_reduce != null) defender.parry_damage_reduce = Number(t.parry_damage_reduce);
        if (t.speed != null && isFinite(Number(t.speed))) defender.speed = Number(t.speed);
        if (t.inner_damage_reduce != null && isFinite(Number(t.inner_damage_reduce))) defender.inner_damage_reduce = clamp01(Number(t.inner_damage_reduce));
        if (t.body_damage_reduce != null && isFinite(Number(t.body_damage_reduce))) defender.body_damage_reduce = clamp01(Number(t.body_damage_reduce));
        if (t.limbs_invulnerable === true) defender.limbs_invulnerable = true;
        if (t.can_attack === false) defender.can_attack = false;
        if (defender.speed == null || !isFinite(Number(defender.speed))) defender.speed = 10;
        if (defender.inner_damage_reduce == null) defender.inner_damage_reduce = 0;
        if (defender.body_damage_reduce == null) defender.body_damage_reduce = 0;
        return defender;
    }

    /**
     * 伤害占位结算之后：未来在此写入敌人部位损毁；limbs_invulnerable 时跳过。
     */
    function onEnemyDamageResolved(ctx) {
        var d = ctx && ctx.defender;
        if (!d || d.kind !== 'enemy') return;
        if (d.limbs_invulnerable) return;
        // TODO: 敌人部位损毁表与存档接入后在此累加 ctx.finalDamage / ctx.hitPart
    }

    global.CombatEnemies = {
        setTable: setTable,
        getById: getById,
        mergeIntoDefender: mergeIntoDefender,
        onEnemyDamageResolved: onEnemyDamageResolved
    };
})(typeof window !== 'undefined' ? window : this);
