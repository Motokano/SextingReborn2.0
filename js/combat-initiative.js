/**
 * 速度先手 / 同速同时结算（07-combat-core、14-implementation）。
 * 不修改 Buff 模板；与 PostEffects.validateSocket 一致的后遗症装配校验。
 */
(function (global) {
    'use strict';

    var SKILL_ID_ENEMY_ATTACK = '__enemy_counter_attack__';
    var MOVE_ID_ENEMY_ATTACK = 'enemy_counter_strike';

    /**
     * 从战斗配置中取当前招式槽对应的后遗症 id 列表（与槽位对齐）。
     */
    function getPostEffectIdsForMoveSlot(IE, limbId, skillId, moveId) {
        if (!IE || typeof IE.getCombatState !== 'function' || !limbId || !skillId || !moveId) return [];
        var c = IE.getCombatState();
        if (!c || !c.move_sequences || !c.post_effect_sequences) return [];
        var seq = c.move_sequences[limbId];
        if (!Array.isArray(seq)) return [];
        var idx = -1;
        var i;
        for (i = 0; i < seq.length; i++) {
            if (seq[i] === moveId) {
                idx = i;
                break;
            }
        }
        if (idx < 0) return [];
        var pmap = c.post_effect_sequences[limbId] && c.post_effect_sequences[limbId][skillId];
        if (!Array.isArray(pmap) || idx >= pmap.length) return [];
        var pid = pmap[idx];
        return pid ? [pid] : [];
    }

    function hasInitiativeAlwaysFirstAmong(postEffectIds, skillId, moveId) {
        if (!postEffectIds || !postEffectIds.length) return false;
        var CP = global.CombatPostEffects;
        if (!CP || typeof CP.getPostEffect !== 'function') return false;
        var ii;
        for (ii = 0; ii < postEffectIds.length; ii++) {
            var pid = postEffectIds[ii];
            if (!pid) continue;
            var pe = CP.getPostEffect(pid);
            if (!pe || pe.effect_type !== 'initiative_always_first') continue;
            if (typeof CP.validateSocket === 'function' && !CP.validateSocket(pe, { skillId: skillId, moveId: moveId })) continue;
            return true;
        }
        return false;
    }

    /**
     * 玩家发起普攻交换时的先后手（不含连击多段，由上层按段重复调用或扩展）。
     * @param {object} o
     * @param {number} o.playerSpeed 取整后
     * @param {number} o.enemySpeed 取整后
     * @param {string[]} o.attackerPostEffectIds 玩家本击后遗症
     * @param {string[]} [o.defenderPostEffectIds] 敌人若将来装配对称规则
     * @param {string} o.skillId
     * @param {string} o.moveId
     * @returns {{ mode: 'sequential'|'simultaneous', firstStrike: 'player'|'enemy', attackerForced: boolean, defenderForced: boolean, canceledForced: boolean }}
     */
    function resolvePlayerInitiatedExchange(o) {
        o = o || {};
        var Vp = Math.floor(Number(o.playerSpeed)) || 0;
        var Ve = Math.floor(Number(o.enemySpeed)) || 0;
        if (Vp < 1) Vp = 1;
        if (Ve < 1) Ve = 1;

        var atkP = Array.isArray(o.attackerPostEffectIds) ? o.attackerPostEffectIds : [];
        var defP = Array.isArray(o.defenderPostEffectIds) ? o.defenderPostEffectIds : [];
        var sk = o.skillId || '';
        var mv = o.moveId || '';

        var atkForced = hasInitiativeAlwaysFirstAmong(atkP, sk, mv);
        var defForced = false;
        var di;
        for (di = 0; di < defP.length; di++) {
            var dpe = defP[di] && global.CombatPostEffects && global.CombatPostEffects.getPostEffect(defP[di]);
            if (dpe && dpe.effect_type === 'initiative_always_first') {
                defForced = true;
                break;
            }
        }

        var canceled = false;
        if (atkForced && defForced) {
            canceled = true;
            atkForced = false;
            defForced = false;
        }

        if (atkForced) {
            return { mode: 'sequential', firstStrike: 'player', attackerForced: true, defenderForced: false, canceledForced: canceled };
        }
        if (defForced) {
            return { mode: 'sequential', firstStrike: 'enemy', attackerForced: false, defenderForced: true, canceledForced: canceled };
        }

        if (Vp > Ve) return { mode: 'sequential', firstStrike: 'player', attackerForced: false, defenderForced: false, canceledForced: canceled };
        if (Ve > Vp) return { mode: 'sequential', firstStrike: 'enemy', attackerForced: false, defenderForced: false, canceledForced: canceled };

        return { mode: 'simultaneous', firstStrike: 'player', attackerForced: false, defenderForced: false, canceledForced: canceled };
    }

    function getEnemyAttackSkillId() {
        return SKILL_ID_ENEMY_ATTACK;
    }

    function getEnemyAttackMoveId() {
        return MOVE_ID_ENEMY_ATTACK;
    }

    global.CombatInitiative = {
        getPostEffectIdsForMoveSlot: getPostEffectIdsForMoveSlot,
        hasInitiativeAlwaysFirstAmong: hasInitiativeAlwaysFirstAmong,
        resolvePlayerInitiatedExchange: resolvePlayerInitiatedExchange,
        getEnemyAttackSkillId: getEnemyAttackSkillId,
        getEnemyAttackMoveId: getEnemyAttackMoveId
    };
})(typeof window !== 'undefined' ? window : this);
