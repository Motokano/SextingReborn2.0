/**
 * 速度先手 / 同速同时结算（07-combat-core、14-implementation）。
 * 不修改 Buff 模板；与 PostEffects.validateSocket 一致的后遗症装配校验。
 */
(function (global) {
    'use strict';

    var SKILL_ID_ENEMY_ATTACK = '__enemy_counter_attack__';
    var MOVE_ID_ENEMY_ATTACK = 'enemy_counter_strike';

    /**
     * 从战斗配置中取当前肢体装配的后遗症 id 列表（肢体级）。
     */
    function getPostEffectIdsForMoveSlot(IE, limbId, skillId, moveId) {
        if (!IE || typeof IE.getCombatState !== 'function' || !limbId || !skillId || !moveId) return [];
        var c = IE.getCombatState();
        if (!c || !c.post_effect_sequences) return [];
        var pid = c.post_effect_sequences[limbId];
        return pid ? [String(pid)] : [];
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
     * 约定：**先**按取整速度比较先后/同速；**再**叠玩家/敌方 `initiative_always_first` 类后遗症（`attackerPostEffectIds` 依赖本击**已确定**的出招肢与招式槽；地图普攻敌先还击时在 `attackEnemy` 内须推迟到二次选肢后，见 `07-combat-core`）。
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

        var atkForcedRaw = hasInitiativeAlwaysFirstAmong(atkP, sk, mv);
        var defForcedRaw = false;
        var di;
        for (di = 0; di < defP.length; di++) {
            var dpe = defP[di] && global.CombatPostEffects && global.CombatPostEffects.getPostEffect(defP[di]);
            if (dpe && dpe.effect_type === 'initiative_always_first') {
                defForcedRaw = true;
                break;
            }
        }

        var canceled = false;
        var atkForced = atkForcedRaw;
        var defForced = defForcedRaw;
        if (atkForced && defForced) {
            canceled = true;
            atkForced = false;
            defForced = false;
        }

        var mode;
        var firstStrike;
        if (Vp > Ve) {
            mode = 'sequential';
            firstStrike = 'player';
        } else if (Ve > Vp) {
            mode = 'sequential';
            firstStrike = 'enemy';
        } else {
            mode = 'simultaneous';
            firstStrike = 'player';
        }

        if (atkForced) {
            return { mode: 'sequential', firstStrike: 'player', attackerForced: true, defenderForced: false, canceledForced: canceled };
        }
        if (defForced) {
            return { mode: 'sequential', firstStrike: 'enemy', attackerForced: false, defenderForced: true, canceledForced: canceled };
        }

        return { mode: mode, firstStrike: firstStrike, attackerForced: false, defenderForced: false, canceledForced: canceled };
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
