/**
 * 速度先手 / 同速同时结算（07-combat-core、14-implementation）。
 * 不修改 Buff 模板；与 PostEffects.validateSocket 一致的后遗症装配校验。
 */
(function (global) {
    'use strict';

    var SKILL_ID_ENEMY_ATTACK = '__enemy_counter_attack__';
    var MOVE_ID_ENEMY_ATTACK = 'enemy_counter_strike';
    function effectiveSpeed(owner, base) {
        var bs = global.BuffSystem;
        var mult = bs && bs.getBattleMoveSpeedMultiplier ? Number(bs.getBattleMoveSpeedMultiplier(owner)) || 1 : 1;
        var delta = bs && bs.getBattleMoveSpeedDeltaPercent ? Number(bs.getBattleMoveSpeedDeltaPercent(owner)) || 0 : 0;
        var extra = Number(global.CombatEnemies?.speedBuffBase?.(owner,base) ?? base) * delta / 100;
        if (owner === 'player' && global.CharacterAttributes && global.CharacterAttributes.getCombatSpeed) {
            extra = global.CharacterAttributes.getCombatSpeed(delta) - global.CharacterAttributes.getCombatSpeed();
        }
        return Math.max(1, Number(base) * mult + extra);
    }

    /** base 为已结算全局修正的速度；肢体百分比复用原速度加算区，再加固定奖励。 */
    function playerAttackSpeed(base, attackInfo) {
        var a = attackInfo || {}, M = global.Muscles;
        var eligible = !a.weaponId && !a.weaponIntent && M;
        var bonus = eligible && M.getAttackSpeedBonusForLimb
            ? M.getAttackSpeedBonusForLimb(a.limbId) : 0;
        var pct = eligible && M.getAttackSpeedPercentForLimb ? M.getAttackSpeedPercentForLimb(a.limbId) : 0;
        var CA = global.CharacterAttributes;
        var extra = pct && CA && CA.getCombatSpeed ? CA.getCombatSpeed(pct) - CA.getCombatSpeed() : 0;
        return Math.max(1, Number(base) + extra + bonus);
    }

    /**
     * 玩家当前攻击生效的后遗症 id 列表（34 号草案阶段三：来源为肌群大型被动的装配；
     * 生效边界见 Muscles.getEquippedPostEffectIdsForAttack —— 招式形态调用装配肌群才触发，
     * 侧肌群槽仅同侧出招、中轴肌群槽左右同生效；招式维度的二次校验由 valid_move_ids 在结算时完成）。
     * @param {{limbId?: string, formTags?: string[]}} [attackInfo] 出招肢体 + 招式形态标签（required_limb_tags）
     */
    function getPlayerPostEffectIds(attackInfo) {
        if (!global.Muscles || typeof global.Muscles.getEquippedPostEffectIdsForAttack !== 'function') return [];
        return global.Muscles.getEquippedPostEffectIdsForAttack(attackInfo || null);
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
     * 约定：**先**按取整速度比较先后/同速；**再**叠玩家/敌方 `initiative_always_first` 类后遗症（`attackerPostEffectIds` 来源为肌群大型被动的装配，见 `getPlayerPostEffectIds`；地图普攻敌先还击时在 `attackEnemy` 内须推迟到二次选肢后，见 `07-combat-core`）。
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
        var VpRaw = Number(o.playerSpeed);
        var VeRaw = Number(o.enemySpeed);
        if (!isFinite(VpRaw)) VpRaw = 0;
        if (!isFinite(VeRaw)) VeRaw = 0;
        // 保留小数比较（05 5.7：内部小数，仅展示取整）；同速 = 精确相等时同时结算
        var playerBaseSpeed = effectiveSpeed('player', VpRaw);
        var Vp = playerAttackSpeed(playerBaseSpeed, o);
        var Ve = effectiveSpeed(String(o.enemyOwnerId || ''), VeRaw);
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
            return { mode: 'sequential', firstStrike: 'player', attackerForced: true, defenderForced: false, canceledForced: canceled,playerSpeed:Vp,playerBaseSpeed:playerBaseSpeed,enemySpeed:Ve };
        }
        if (defForced) {
            return { mode: 'sequential', firstStrike: 'enemy', attackerForced: false, defenderForced: true, canceledForced: canceled,playerSpeed:Vp,playerBaseSpeed:playerBaseSpeed,enemySpeed:Ve };
        }

        return { mode: mode, firstStrike: firstStrike, attackerForced: false, defenderForced: false, canceledForced: canceled,playerSpeed:Vp,playerBaseSpeed:playerBaseSpeed,enemySpeed:Ve };
    }

    function getEnemyAttackSkillId() {
        return SKILL_ID_ENEMY_ATTACK;
    }

    function getEnemyAttackMoveId() {
        return MOVE_ID_ENEMY_ATTACK;
    }

    global.CombatInitiative = {
        effectiveSpeed: effectiveSpeed,
        playerAttackSpeed: playerAttackSpeed,
        getPlayerPostEffectIds: getPlayerPostEffectIds,
        hasInitiativeAlwaysFirstAmong: hasInitiativeAlwaysFirstAmong,
        resolvePlayerInitiatedExchange: resolvePlayerInitiatedExchange,
        getEnemyAttackSkillId: getEnemyAttackSkillId,
        getEnemyAttackMoveId: getEnemyAttackMoveId
    };
})(typeof window !== 'undefined' ? window : this);
