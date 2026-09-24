/** 呼吸法：配置驱动的气力积蓄与整招爆发。状态只存于 BuffSystem。 */
(function (g) {
    'use strict';
    function mounted() {
        var ie = g.InventoryEquipment, cs = g.CombatSkills;
        var id = ie && ie.getCombatState && (ie.getCombatState().hubs || {}).breath;
        return id && cs && cs.getSkill(id);
    }
    function inCombat() { return !!(g.CombatEngagement && g.CombatEngagement.isPlayerInCombat()); }
    function stacks(id) { return g.BuffSystem ? g.BuffSystem.getBuffStacksSum('player', id) : 0; }
    function config() { var sk = mounted(); return sk && sk.breath_special; }
    function active() {
        var c = config();
        if (!c || !inCombat() || stacks(c.effect_buff) <= 0) return null;
        var tpl = g.BuffSystem.getTemplate(c.effect_buff);
        var effect = tpl && (tpl.effects || []).filter(function(e){return e.type === 'breath_attack';})[0];
        return effect ? Object.assign({}, c, effect.params) : null;
    }
    function clear() {
        if (g.BuffSystem) g.BuffSystem.removeBuffsByJudgmentTag('player', 'breath');
    }
    function spent(amount) {
        var c = config();
        if (!c || !inCombat() || active() || amount <= 0 || !g.BuffSystem) return;
        g.BuffSystem.setBuffStacks('player', c.counter_buff, Math.min(c.threshold, stacks(c.counter_buff) + amount));
    }
    function canActivate() {
        var c = config();
        return !!(c && inCombat() && !active() && stacks(c.counter_buff) >= c.threshold);
    }
    function activate() {
        if (!canActivate()) return false;
        var c = config();
        if (!g.BuffSystem.setBuffStacks('player', c.effect_buff, c.attacks)) return false;
        g.BuffSystem.removeBuffByBuffId('player', c.counter_buff);
        if (c.fill_qi && g.Survival) g.Survival.addQiLi(g.Survival.getQiLiMax());
        return true;
    }
    function finish(snapshot) {
        if (snapshot && g.BuffSystem) g.BuffSystem.setBuffStacks('player', snapshot.effect_buff, stacks(snapshot.effect_buff) - 1);
    }
    function range(move) { return Math.max(1, Number(move && (move.attack_range || move.range)) || 1) + (active() ? Number(active().range_bonus) || 0 : 0); }
    g.CombatBreath = { mounted: mounted, active: active, clear: clear, spent: spent,
        canActivate: canActivate, activate: activate, finish: finish, range: range };
})(typeof window !== 'undefined' ? window : this);
