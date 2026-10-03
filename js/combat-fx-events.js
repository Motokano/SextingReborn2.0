/** Immutable presentation events emitted after an action resolves, before displacement.
 * This module never rolls hits, applies damage, or reads equipment to invent segments.
 */
(function (global) {
    'use strict';
    var sequence = 0;
    function nextGroupId() { return 'exchange_' + (++sequence); }
    function actorSnapshot(actor) {
        var a = actor || {}, p = a.pos || {};
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
        return { kind:a.kind, enemyId:a.enemyId || null, index:a.index, x:p.x, y:p.y,
            key:a.kind === 'player' ? 'player' : 'enemy:' + (a.index != null ? a.index : (a.enemyId + ':' + p.x + ':' + p.y)) };
    }
    function capture(ctx) {
        if (!ctx || ctx._segmentOfAction || ctx._fxSnapshot) return;
        var st = global.GameEngine && global.GameEngine.getState();
        var attacker = actorSnapshot(ctx.attacker), defender = actorSnapshot(ctx.defender);
        if (!attacker || !defender || !st || st.mapId == null) return;
        ctx._fxSnapshot = { actionId:'strike_' + (++sequence), mapId:st.mapId,
            groupId:ctx.fxGroupId || null, simultaneous:!!ctx.simultaneousDryRun,
            attacker:attacker, defender:defender, emitted:false };
    }
    function resultOf(s) {
        if (s.distanceMiss) return 'distance';
        if (s.forceZeroDamageByResourceInsufficient) return 'dry';
        if (s.hitRollSuccess === false) return 'miss';
        if (s.parrySucceeded) return 'parry';
        if (Number(s.finalDamage) === 0 && s.defenseBreakdown && s.defenseBreakdown.absorbed > 0) return 'armor';
        return 'hit';
    }
    function publish(ctx) {
        if (!ctx || ctx.simultaneousDryRun || ctx._segmentOfAction) return;
        var snap = ctx._fxSnapshot, bus = global.SceneAnimation;
        if (!snap || snap.emitted || !bus || !bus.emit) return;
        snap.emitted = true;
        var segments = (Array.isArray(ctx.segmentsResults) ? ctx.segmentsResults : [ctx]).map(function (s,i) {
            return { segmentId:snap.actionId + ':' + i, moveId:s.fxMoveId || ctx.fxMoveId || (s.moveTemplate && s.moveTemplate.fx_move_id) || s.moveId || ctx.moveId,
                hitPart:s.hitPart || 'chest', limbId:s.limbId || ctx.limbId || 'rhand',
                result:resultOf(s), damage:Math.max(0,Number(s.finalDamage) || 0),
                damageType:s.damageType || ctx.damageType || 'blunt',
                powerFactor:Number.isFinite(s.fxPowerFactor) ? s.fxPowerFactor : 1 };
        });
        bus.emit('combat:resolved', { actionId:snap.actionId, mapId:snap.mapId, groupId:snap.groupId,
            simultaneous:snap.simultaneous, baseSegments:Number(ctx.moveTemplate&&ctx.moveTemplate.hit_segments)||(ctx.moveId==='slap_combo'?2:1),
            attacker:Object.assign({},snap.attacker), defender:Object.assign({},snap.defender),
            segments:segments });
    }
    global.CombatFxEvents = { capture:capture, publish:publish, nextGroupId:nextGroupId };
})(typeof window !== 'undefined' ? window : globalThis);
