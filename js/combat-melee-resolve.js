/**
 * 玩家近战攻敌人：命中率、部位抽样、徒手原始伤害链、气力/底气扣费（与 11-skills / 14-implementation 方案 1 一致）。
 * 减伤链中敌人侧内功/身体/类型微调在 combat-pipeline builtin.enemy_damage_mitigation。
 */
(function (global) {
    'use strict';

    var HIT_PART_LABEL_KEYS = {
        head: 'body.part.head',
        chest: 'body.part.chest',
        abdomen: 'body.part.belly',
        left_arm: 'body.part.lhand',
        right_arm: 'body.part.rhand',
        left_leg: 'body.part.lfoot',
        right_leg: 'body.part.rfoot'
    };

    function tUi(key, vars) {
        try {
            if (global.UIText && typeof global.UIText.t === 'function') return global.UIText.t(key, vars);
        } catch (e) { /* ignore */ }
        return key;
    }

    function logLine(key, vars, type) {
        if (!global.GameLog || typeof global.GameLog.log !== 'function') return;
        global.GameLog.log(tUi(key, vars), type || 'damage');
    }

    function clamp(n, lo, hi) {
        return Math.max(lo, Math.min(hi, n));
    }

    /**
     * 14-implementation：B=clamp(floor(Dmax*r),dmin,dmax)，C=B*(k/10)，扣量=max(1,round(C))，实扣 min(扣量,当前)。
     */
    function computeIntendedResourceCost(dMax, costCfg, k) {
        if (!costCfg || dMax == null || !isFinite(Number(dMax)) || Number(dMax) <= 0) return 0;
        var ratio = costCfg.ratio_of_qi_li_max_at_10_power != null ? Number(costCfg.ratio_of_qi_li_max_at_10_power)
            : (costCfg.ratio_of_diqi_max_at_10_power != null ? Number(costCfg.ratio_of_diqi_max_at_10_power) : 0);
        if (!isFinite(ratio) || ratio <= 0) return 0;
        var dmin = costCfg.min != null ? Number(costCfg.min) : 1;
        var dmax = costCfg.max != null ? Number(costCfg.max) : 50;
        var B = Math.floor(Number(dMax) * ratio);
        B = clamp(B, dmin, dmax);
        var C = B * (k / 10);
        return Math.max(1, Math.round(C));
    }

    function mapHitPartToModifierKey(hitPart) {
        var m = {
            head: 'head',
            chest: 'chest',
            abdomen: 'abdomen',
            left_arm: 'left_hand',
            right_arm: 'right_hand',
            left_leg: 'left_foot',
            right_leg: 'right_foot'
        };
        return m[hitPart] || 'chest';
    }

    function limbToEquipSlot(limbId) {
        if (limbId === 'lhand') return 'glove_left';
        if (limbId === 'rhand') return 'glove_right';
        if (limbId === 'lfoot') return 'shoe_left';
        if (limbId === 'rfoot') return 'shoe_right';
        return 'glove_right';
    }

    function getSkillCoefForLimb(IE, limbId) {
        if (!IE || typeof IE.getState !== 'function' || typeof IE.getItemTemplate !== 'function') return 1;
        var slot = limbToEquipSlot(limbId);
        var eq = IE.getState().equipment && IE.getState().equipment[slot];
        if (!eq || !eq.item_id) return 1;
        var tpl = IE.getItemTemplate(eq.item_id);
        var c = tpl && tpl.skill_coef != null ? Number(tpl.skill_coef) : 1;
        return isFinite(c) && c > 0 ? c : 1;
    }

    function sampleHitPart(move) {
        var w = (move && move.hit_part_weights) || {};
        var keys = Object.keys(w).filter(function (k) { return (Number(w[k]) || 0) > 0; });
        if (!keys.length) return 'chest';
        var sum = 0;
        var i;
        for (i = 0; i < keys.length; i++) sum += Number(w[keys[i]]) || 0;
        if (sum <= 0) return 'chest';
        var r = Math.random() * sum;
        var acc = 0;
        for (i = 0; i < keys.length; i++) {
            acc += Number(w[keys[i]]) || 0;
            if (r <= acc) return keys[i];
        }
        return keys[keys.length - 1];
    }

    function getBuffProbeStacks(ownerId) {
        if (!global.BuffSystem || typeof global.BuffSystem.getBuffStacksSum !== 'function') return 0;
        return global.BuffSystem.getBuffStacksSum(ownerId || 'player', 'buff_probe') || 0;
    }

    function pickResolvedMove(CS, IE, skillId, preferredMoveId) {
        var sk = CS && typeof CS.getSkill === 'function' ? CS.getSkill(skillId) : null;
        if (!sk || !sk.moves || !sk.moves.length) return { move: null, moveId: preferredMoveId || 'jab' };
        var lv = IE && typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(skillId) : 0;
        var unlocked = CS.getUnlockedMoves ? CS.getUnlockedMoves(skillId, lv) : sk.moves;
        var ids = unlocked.map(function (m) { return m.id; });
        var mid = preferredMoveId;
        if (!mid || ids.indexOf(mid) < 0) mid = ids.length ? ids[0] : sk.moves[0].id;
        var move = null;
        for (var i = 0; i < sk.moves.length; i++) {
            if (sk.moves[i].id === mid) { move = sk.moves[i]; break; }
        }
        return { move: move, moveId: mid };
    }

    function clampPowerK(move, k) {
        if (!move) return clamp(k, 1, 12);
        var lo = move.power_level_min != null ? Number(move.power_level_min) : 1;
        var hi = move.power_level_max != null ? Number(move.power_level_max) : 12;
        return clamp(Number(k) || 10, lo, hi);
    }

    /**
     * @returns {{ rawDamage: number, hitRollSuccess: boolean, hitPart: string, damageType: string, logs: boolean }}
     */
    function resolvePlayerVsEnemyAttack(opts) {
        opts = opts || {};
        var skillId = opts.skillId || 'combat_basic_unarmed';
        var moveIdPref = opts.moveId;
        var limbId = opts.limbId || 'lhand';
        var powerKIn = opts.powerLevel;

        var CS = global.CombatSkills;
        var IE = global.InventoryEquipment;
        var CA = global.CharacterAttributes;
        var Surv = global.Survival;

        var picked = pickResolvedMove(CS, IE, skillId, moveIdPref);
        var move = picked.move;
        var moveId = picked.moveId;
        var powerDefault = move && move.default_power_level != null ? move.default_power_level : 10;
        var powerK = clampPowerK(move, powerKIn != null ? powerKIn : powerDefault);

        if (!move) {
            return {
                rawDamage: 0,
                hitRollSuccess: false,
                hitPart: 'chest',
                damageType: 'blunt',
                skillId: skillId,
                moveId: moveId,
                limbId: limbId,
                powerLevel: powerK,
                wSkill: 0,
                wCoef: 0,
                baseFist: 0,
                kProbe: 1,
                hitChance: 0,
                qiIntended: 0,
                qiSpent: 0,
                diqiIntended: 0,
                diqiSpent: 0
            };
        }

        var damageType = move.damage_type || 'blunt';
        var sk = CS.getSkill(skillId);
        var category = sk && sk.category;

        var Vatk = CA && typeof CA.getCombatSpeed === 'function' ? CA.getCombatSpeed() : 1;
        var Vdef = opts.defenderSpeed != null ? Number(opts.defenderSpeed) : 10;
        if (!isFinite(Vdef) || Vdef < 0) Vdef = 10;

        var P = CA && typeof CA.getHitRate === 'function' ? CA.getHitRate(Vatk, Vdef) : 0.8;
        var hitRollSuccess = Math.random() < P;
        logLine('log.combat.resolve.hit', {
            vAtk: String(Vatk),
            vDef: String(Vdef),
            pct: String(Math.round(P * 1000) / 10),
            result: hitRollSuccess ? tUi('log.combat.resolve.hit_ok') : tUi('log.combat.resolve.hit_miss')
        }, 'combat');

        var hitPart = sampleHitPart(move);
        var partLabelKey = HIT_PART_LABEL_KEYS[hitPart] || hitPart;
        logLine('log.combat.resolve.part', { part: tUi(partLabelKey) });

        var skillLv = IE.getSkillLevel(skillId);
        var skillsState = typeof IE.getSkillsState === 'function' ? (IE.getSkillsState() || {}) : {};
        var moveUsage = (skillsState[skillId] && skillsState[skillId].move_usage) || {};
        var uses = moveUsage[moveId] != null ? parseInt(moveUsage[moveId], 10) || 0 : 0;
        var Rmove = CS.getMoveProficiencyRatio ? CS.getMoveProficiencyRatio(uses) : 0;
        var baseL = CS.getBasePower(skillId, skillLv, null);
        var Wskill = baseL * (1 + Rmove);

        var breathMult = 1;
        if (IE.getCombatState) {
            var hubs = IE.getCombatState().hubs || {};
            var bid = hubs.breath;
            if (bid && CS.getBreathPowerMultiplier) {
                var bu = (skillsState[bid] && skillsState[bid].move_usage) || {};
                breathMult = CS.getBreathPowerMultiplier(bid, bu);
            }
        }
        Wskill *= breathMult;

        var Mmove = move.move_power_multiplier != null ? Number(move.move_power_multiplier) : 1;
        if (!isFinite(Mmove)) Mmove = 1;
        var G = getSkillCoefForLimb(IE, limbId);

        var sProbe = 0;
        if (moveId === 'swing_punch') sProbe = getBuffProbeStacks('player');
        var Kprobe = moveId === 'swing_punch' ? (1 + 0.05 * sProbe) : 1;

        var limbSlot = limbToEquipSlot(limbId);
        var dom = CA && typeof CA.getDominantLimbMultiplier === 'function' ? CA.getDominantLimbMultiplier(limbSlot) : 1;

        var baseWeapon = 0;
        if (category === 'unarmed') {
            baseWeapon = CA && typeof CA.getFistBasePower === 'function' ? CA.getFistBasePower() : 0;
        } else {
            baseWeapon = CA && typeof CA.getFistBasePower === 'function' ? CA.getFistBasePower() : 0;
            logLine('log.combat.resolve.weapon_fallback', {}, 'warn');
        }

        var pk = powerK / 10;
        var wCoef = Wskill * Mmove * G * Kprobe;
        var rawDamage = baseWeapon * wCoef * dom * pk;
        rawDamage = Math.max(0, rawDamage);

        logLine('log.combat.resolve.chain', {
            bf: String(Math.round(baseWeapon)),
            wSkill: String(Math.round(Wskill * 100) / 100),
            mMove: String(Mmove),
            g: String(G),
            kProbe: String(Math.round(Kprobe * 1000) / 1000),
            dom: String(dom),
            k: String(powerK),
            raw: String(Math.round(rawDamage * 100) / 100)
        });

        var qiMax = Surv && typeof Surv.getQiLiMax === 'function' ? Surv.getQiLiMax() : 100;
        var diqiMax = 0;
        if (Surv && typeof Surv.getState === 'function') {
            var ss = Surv.getState();
            diqiMax = ss && ss.diqi_max_effective != null ? Number(ss.diqi_max_effective) : 0;
        }
        if (!isFinite(diqiMax) || diqiMax <= 0) diqiMax = 1;

        var qiIntended = computeIntendedResourceCost(qiMax, move.qi_li_cost, powerK);
        var diqiIntended = computeIntendedResourceCost(diqiMax, move.diqi_cost, powerK);
        var qiCurrent = Infinity;
        var diqiCurrent = Infinity;
        if (Surv && typeof Surv.getState === 'function') {
            var st0 = Surv.getState() || {};
            qiCurrent = st0.qi_li_current != null ? Number(st0.qi_li_current) : 0;
            diqiCurrent = st0.diqi_current != null ? Number(st0.diqi_current) : 0;
            if (!isFinite(qiCurrent) || qiCurrent < 0) qiCurrent = 0;
            if (!isFinite(diqiCurrent) || diqiCurrent < 0) diqiCurrent = 0;
        }
        var insufficientQi = qiIntended > 0 && qiCurrent < qiIntended;
        var insufficientDiqi = diqiIntended > 0 && diqiCurrent < diqiIntended;
        var forceZeroDamageByResourceInsufficient = insufficientQi || insufficientDiqi;
        if (forceZeroDamageByResourceInsufficient) {
            rawDamage = 0;
        }

        var qiSpent = 0;
        var diqiSpent = 0;
        if (Surv && typeof Surv.consumeQiLi === 'function' && qiIntended > 0) {
            qiSpent = Surv.consumeQiLi(qiIntended);
            var stQ = Surv.getState();
            logLine('log.combat.resolve.qi', {
                intend: String(qiIntended),
                act: String(qiSpent),
                cur: String(stQ.qi_li_current != null ? Math.round(stQ.qi_li_current) : 0),
                max: String(qiMax)
            });
        }
        if (Surv && typeof Surv.consumeDiqi === 'function' && diqiIntended > 0) {
            diqiSpent = Surv.consumeDiqi(diqiIntended);
            var stD = Surv.getState();
            logLine('log.combat.resolve.diqi', {
                intend: String(diqiIntended),
                act: String(diqiSpent),
                cur: String(stD.diqi_current != null ? Math.round(stD.diqi_current) : 0),
                max: String(Math.round(diqiMax))
            });
        }

        return {
            rawDamage: rawDamage,
            hitRollSuccess: hitRollSuccess,
            hitPart: hitPart,
            damageType: damageType,
            skillId: skillId,
            moveId: moveId,
            limbId: limbId,
            powerLevel: powerK,
            hitPartModifierKey: mapHitPartToModifierKey(hitPart),
            wSkill: Wskill,
            wCoef: wCoef,
            baseFist: baseWeapon,
            kProbe: Kprobe,
            hitChance: P,
            qiIntended: qiIntended,
            qiSpent: qiSpent,
            diqiIntended: diqiIntended,
            diqiSpent: diqiSpent,
            forceZeroDamageByResourceInsufficient: forceZeroDamageByResourceInsufficient,
            insufficientQiForIntendedCost: insufficientQi,
            insufficientDiqiForIntendedCost: insufficientDiqi,
            proficiencyDelta: 1
        };
    }

    global.CombatMeleeResolve = {
        computeIntendedResourceCost: computeIntendedResourceCost,
        mapHitPartToModifierKey: mapHitPartToModifierKey,
        resolvePlayerVsEnemyAttack: resolvePlayerVsEnemyAttack
    };
})(typeof window !== 'undefined' ? window : this);
