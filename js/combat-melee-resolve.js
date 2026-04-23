/**
 * 玩家近战攻敌人：命中率、部位抽样、原始伤害链（徒手：筋骨底；兵器：持兵 weapon_attack_power）、气力/底气扣费。
 * 减伤链中敌人侧内功/身体/类型微调在 combat-pipeline builtin.enemy_damage_mitigation。
 */
(function (global) {
    'use strict';
    var DAMAGE_TYPES = ['blunt', 'slash', 'pierce'];

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

    function normalizeDamageType(t) {
        var v = String(t || '').toLowerCase();
        return DAMAGE_TYPES.indexOf(v) >= 0 ? v : 'blunt';
    }

    function createEmptyTypedDamage() {
        return { blunt: 0, slash: 0, pierce: 0 };
    }

    function cloneTypedDamage(src) {
        src = src || {};
        return {
            blunt: Math.max(0, Number(src.blunt) || 0),
            slash: Math.max(0, Number(src.slash) || 0),
            pierce: Math.max(0, Number(src.pierce) || 0)
        };
    }

    function toPct(raw) {
        var v = Number(raw);
        if (!isFinite(v)) return 0;
        if (Math.abs(v) > 1) return v / 100;
        return v;
    }

    function normalizeDamageTypeEffects(src) {
        src = src || {};
        var out = {
            add_flat: createEmptyTypedDamage(),
            add_from_pct: [],
            increase_pct: createEmptyTypedDamage(),
            convert_pct: { blunt_to_slash: 0, slash_to_pierce: 0 }
        };
        var t;
        if (src.add_flat && typeof src.add_flat === 'object') {
            for (t in out.add_flat) {
                if (!out.add_flat.hasOwnProperty(t)) continue;
                out.add_flat[t] += Number(src.add_flat[t]) || 0;
            }
        }
        if (src.increase_pct && typeof src.increase_pct === 'object') {
            for (t in out.increase_pct) {
                if (!out.increase_pct.hasOwnProperty(t)) continue;
                out.increase_pct[t] += toPct(src.increase_pct[t]);
            }
        }
        if (Array.isArray(src.add_from_pct)) {
            for (var i = 0; i < src.add_from_pct.length; i++) {
                var ent = src.add_from_pct[i] || {};
                var fromT = normalizeDamageType(ent.source || ent.from);
                var toT = normalizeDamageType(ent.target || ent.to);
                var pct = toPct(ent.pct != null ? ent.pct : ent.value);
                if (!pct) continue;
                out.add_from_pct.push({ source: fromT, target: toT, pct: pct });
            }
        }
        if (src.convert_pct && typeof src.convert_pct === 'object') {
            out.convert_pct.blunt_to_slash += toPct(src.convert_pct.blunt_to_slash);
            out.convert_pct.slash_to_pierce += toPct(src.convert_pct.slash_to_pierce);
        }
        out.convert_pct.blunt_to_slash = clamp(out.convert_pct.blunt_to_slash, 0, 1);
        out.convert_pct.slash_to_pierce = clamp(out.convert_pct.slash_to_pierce, 0, 1);
        return out;
    }

    function mergeDamageTypeEffects(dst, src) {
        src = normalizeDamageTypeEffects(src);
        for (var t in dst.add_flat) {
            if (!dst.add_flat.hasOwnProperty(t)) continue;
            dst.add_flat[t] += src.add_flat[t];
            dst.increase_pct[t] += src.increase_pct[t];
        }
        dst.convert_pct.blunt_to_slash = clamp(dst.convert_pct.blunt_to_slash + src.convert_pct.blunt_to_slash, 0, 1);
        dst.convert_pct.slash_to_pierce = clamp(dst.convert_pct.slash_to_pierce + src.convert_pct.slash_to_pierce, 0, 1);
        if (src.add_from_pct && src.add_from_pct.length) {
            dst.add_from_pct = dst.add_from_pct.concat(src.add_from_pct);
        }
        return dst;
    }

    function extractEffectsFromCarrier(carrier) {
        if (!carrier || typeof carrier !== 'object') return null;
        if (carrier.damage_type_effects && typeof carrier.damage_type_effects === 'object') {
            return carrier.damage_type_effects;
        }
        return null;
    }

    function resolveDamageTypeEffects(opts) {
        opts = opts || {};
        var merged = normalizeDamageTypeEffects(null);
        var CA = opts.CA;
        if (CA && typeof CA.getDamageTypeCombatModifiers === 'function') {
            mergeDamageTypeEffects(merged, CA.getDamageTypeCombatModifiers() || null);
        }
        mergeDamageTypeEffects(merged, extractEffectsFromCarrier(opts.move));
        mergeDamageTypeEffects(merged, extractEffectsFromCarrier(opts.weaponTpl));
        return merged;
    }

    function applyTypedDamageEffects(baseTyped, effects) {
        var typed = cloneTypedDamage(baseTyped);
        var logs = {
            initial: cloneTypedDamage(baseTyped),
            afterInject: null,
            afterIncrease1: null,
            afterConvert: null,
            afterIncrease2: null
        };
        var t;
        for (t in typed) {
            if (!typed.hasOwnProperty(t)) continue;
            typed[t] += Number(effects.add_flat[t]) || 0;
        }
        var preBoostSnapshot = cloneTypedDamage(typed);
        for (var i = 0; i < effects.add_from_pct.length; i++) {
            var ent = effects.add_from_pct[i];
            var fromV = preBoostSnapshot[ent.source] || 0;
            typed[ent.target] += fromV * ent.pct;
        }
        logs.afterInject = cloneTypedDamage(typed);
        for (t in typed) {
            if (!typed.hasOwnProperty(t)) continue;
            typed[t] *= (1 + (effects.increase_pct[t] || 0));
        }
        logs.afterIncrease1 = cloneTypedDamage(typed);

        var gainedByConvert = createEmptyTypedDamage();
        var convBS = effects.convert_pct.blunt_to_slash || 0;
        if (convBS > 0 && typed.blunt > 0) {
            var movedBS = typed.blunt * convBS;
            typed.blunt -= movedBS;
            typed.slash += movedBS;
            gainedByConvert.slash += movedBS;
        }
        var convSP = effects.convert_pct.slash_to_pierce || 0;
        if (convSP > 0 && typed.slash > 0) {
            var movedSP = typed.slash * convSP;
            typed.slash -= movedSP;
            typed.pierce += movedSP;
            gainedByConvert.pierce += movedSP;
        }
        logs.afterConvert = cloneTypedDamage(typed);

        if (gainedByConvert.slash > 0) typed.slash += gainedByConvert.slash * (effects.increase_pct.slash || 0);
        if (gainedByConvert.pierce > 0) typed.pierce += gainedByConvert.pierce * (effects.increase_pct.pierce || 0);
        logs.afterIncrease2 = cloneTypedDamage(typed);
        return {
            typedDamage: typed,
            stages: logs
        };
    }

    function sumTypedDamage(typed) {
        typed = typed || {};
        return Math.max(0, (Number(typed.blunt) || 0) + (Number(typed.slash) || 0) + (Number(typed.pierce) || 0));
    }

    function sumPositive(arr) {
        if (!Array.isArray(arr) || !arr.length) return 0;
        var out = 0;
        for (var i = 0; i < arr.length; i++) {
            var v = Number(arr[i]);
            if (!isFinite(v) || v <= 0) continue;
            out += v;
        }
        return out;
    }

    function sumNegativeAbs(arr) {
        if (!Array.isArray(arr) || !arr.length) return 0;
        var out = 0;
        for (var i = 0; i < arr.length; i++) {
            var v = Number(arr[i]);
            if (!isFinite(v) || v >= 0) continue;
            out += Math.abs(v);
        }
        return out;
    }

    function multiplyFactors(factors, fallback) {
        if (!Array.isArray(factors) || !factors.length) return fallback;
        var out = 1;
        var hasAny = false;
        for (var i = 0; i < factors.length; i++) {
            var v = Number(factors[i]);
            if (!isFinite(v) || v <= 0) continue;
            out *= v;
            hasAny = true;
        }
        return hasAny ? out : fallback;
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

    function limbToWeaponSlot(limbId) {
        if (limbId === 'lhand') return 'weapon_left';
        if (limbId === 'rhand') return 'weapon_right';
        return null;
    }

    function getWeaponItemTemplateForLimb(IE, limbId) {
        var slot = limbToWeaponSlot(limbId);
        if (!slot || !IE || typeof IE.getState !== 'function' || typeof IE.getItemTemplate !== 'function') return null;
        var eq = IE.getState().equipment && IE.getState().equipment[slot];
        if (!eq || !eq.item_id) return null;
        return IE.getItemTemplate(eq.item_id) || null;
    }

    /** 兵器模板 `weapon_attack_power`（或兼容 `attack_power`）；无槽/无模板为 0 */
    function getWeaponAttackPowerForLimb(IE, limbId) {
        var tpl = getWeaponItemTemplateForLimb(IE, limbId);
        if (!tpl) return 0;
        var v = tpl.weapon_attack_power != null ? Number(tpl.weapon_attack_power)
            : (tpl.attack_power != null ? Number(tpl.attack_power) : NaN);
        if (!isFinite(v) || v < 0) return 0;
        return v;
    }

    /** 兵器技能：G 取自持兵 `skill_coef`，缺省 1 */
    function getWeaponSkillCoefForLimb(IE, limbId) {
        var tpl = getWeaponItemTemplateForLimb(IE, limbId);
        if (!tpl) return 1;
        var c = tpl.skill_coef != null ? Number(tpl.skill_coef) : 1;
        return isFinite(c) && c > 0 ? c : 1;
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
                typedDamage: createEmptyTypedDamage(),
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
                diqiSpent: 0,
                deferredResourceSpend: false,
                qiIntendedForCommit: 0,
                diqiIntendedForCommit: 0,
                proficiencyDelta: 0,
                skillTotalMult: 1,
                expMult: 1,
                combatExperience: 0,
                increasedSum: 0,
                decreasedSum: 0,
                moreSum: 0,
                lessSum: 0
            };
        }

        var damageType = normalizeDamageType(move.damage_type || 'blunt');
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
        if (!isFinite(baseL) || baseL <= 0) baseL = 1;

        var breathMult = 1;
        if (IE.getCombatState) {
            var hubs = IE.getCombatState().hubs || {};
            var bid = hubs.breath;
            if (bid && CS.getBreathPowerMultiplier) {
                var bu = (skillsState[bid] && skillsState[bid].move_usage) || {};
                breathMult = CS.getBreathPowerMultiplier(bid, bu);
            }
        }
        if (!isFinite(breathMult) || breathMult <= 0) breathMult = 1;

        var Mmove = move.move_power_multiplier != null ? Number(move.move_power_multiplier) : 1;
        if (!isFinite(Mmove) || Mmove <= 0) Mmove = 1;
        var G = category === 'weapon'
            ? getWeaponSkillCoefForLimb(IE, limbId)
            : getSkillCoefForLimb(IE, limbId);

        var sProbe = 0;
        if (moveId === 'swing_punch') sProbe = getBuffProbeStacks('player');
        var Kprobe = moveId === 'swing_punch' ? (1 + 0.05 * sProbe) : 1;

        var limbSlot = limbToEquipSlot(limbId);
        var dom = CA && typeof CA.getDominantLimbMultiplier === 'function' ? CA.getDominantLimbMultiplier(limbSlot) : 1;
        if (!isFinite(dom)) dom = 1;

        var baseWeapon = 0;
        if (category === 'unarmed') {
            baseWeapon = CA && typeof CA.getFistBasePower === 'function' ? CA.getFistBasePower() : 0;
        } else if (category === 'weapon') {
            baseWeapon = getWeaponAttackPowerForLimb(IE, limbId);
            if ((!baseWeapon || baseWeapon <= 0) && (limbId === 'lfoot' || limbId === 'rfoot')) {
                logLine('log.combat.resolve.weapon_foot_base', { limb: String(limbId) }, 'warn');
            }
        } else {
            baseWeapon = CA && typeof CA.getFistBasePower === 'function' ? CA.getFistBasePower() : 0;
            logLine('log.combat.resolve.weapon_fallback', {}, 'warn');
        }

        var pk = powerK / 10;
        /**
         * 统一四口径：
         * - 增加/减少：同一加性增伤区（increased/decreased）
         * - 总增/总减：独立乘区（more/less）
         */
        var addTerms = [(baseL - 1), (breathMult - 1), (Mmove - 1), (G - 1), (Kprobe - 1), (dom - 1), Rmove];
        var increasedSum = sumPositive(addTerms);
        var decreasedSum = sumNegativeAbs(addTerms);
        var dmgBonusAdd = increasedSum - decreasedSum;
        var dmgBonusMult = 1 + dmgBonusAdd;
        if (!isFinite(dmgBonusMult)) dmgBonusMult = 1;
        if (dmgBonusMult < 0) dmgBonusMult = 0;
        var combatExpMult = 1;
        var combatExpVal = 0;
        if (IE && typeof IE.getCombatExperienceDamageMultiplier === 'function') {
            combatExpMult = IE.getCombatExperienceDamageMultiplier();
            if (typeof IE.getCombatExperience === 'function') combatExpVal = IE.getCombatExperience();
        }
        if (!isFinite(combatExpMult) || combatExpMult < 1) combatExpMult = 1;
        var moreFactors = [combatExpMult];
        var lessFactors = [];
        var moreMult = multiplyFactors(moreFactors, 1);
        var lessMult = multiplyFactors(lessFactors, 1);
        var moreSum = sumPositive([moreMult - 1]);
        var lessSum = sumNegativeAbs([lessMult - 1]);
        var independentMult = moreMult * lessMult;
        var rawDamage = baseWeapon * dmgBonusMult * independentMult * pk;
        rawDamage = Math.max(0, rawDamage);
        var baseTypedDamage = createEmptyTypedDamage();
        baseTypedDamage[damageType] = rawDamage;
        var triEffects = resolveDamageTypeEffects({
            CA: CA,
            IE: IE,
            skillId: skillId,
            moveId: moveId,
            limbId: limbId,
            move: move,
            weaponTpl: getWeaponItemTemplateForLimb(IE, limbId)
        });
        var typedEval = applyTypedDamageEffects(baseTypedDamage, triEffects);
        var typedDamage = typedEval.typedDamage;
        rawDamage = sumTypedDamage(typedDamage);

        logLine('log.combat.resolve.chain', {
            baseTag: tUi(category === 'weapon' ? 'log.combat.resolve.base_tag_weapon' : 'log.combat.resolve.base_tag_unarmed'),
            bf: String(Math.round(baseWeapon * 100) / 100),
            zEng: String(Math.round(dmgBonusMult * 1000) / 1000),
            addD: String(Math.round(dmgBonusAdd * 1000) / 1000),
            zExp: String(Math.round(independentMult * 1000) / 1000),
            rCombatExp: String(combatExpVal),
            rMove: String(Math.round(Rmove * 1000) / 1000),
            mMove: String(Mmove),
            g: String(G),
            kProbe: String(Math.round(Kprobe * 1000) / 1000),
            dom: String(dom),
            k: String(powerK),
            raw: String(Math.round(rawDamage * 100) / 100) + ' [inc=' + Math.round(increasedSum * 1000) / 1000 +
                ', dec=' + Math.round(decreasedSum * 1000) / 1000 +
                ', more=' + Math.round(moreSum * 1000) / 1000 +
                ', less=' + Math.round(lessSum * 1000) / 1000 + ']'
        });
        logLine('log.combat.resolve.chain', {
            baseTag: 'typed(initial/inject/inc1/convert/inc2)',
            bf: '',
            zEng: '',
            addD: '',
            zExp: '',
            rCombatExp: '',
            rMove: '',
            mMove: '',
            g: '',
            kProbe: '',
            dom: '',
            k: '',
            raw: [
                'B:' + Math.round((typedEval.stages.initial.blunt || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.initial.slash || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.initial.pierce || 0) * 100) / 100,
                'I:' + Math.round((typedEval.stages.afterInject.blunt || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.afterInject.slash || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.afterInject.pierce || 0) * 100) / 100,
                'P1:' + Math.round((typedEval.stages.afterIncrease1.blunt || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.afterIncrease1.slash || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.afterIncrease1.pierce || 0) * 100) / 100,
                'C:' + Math.round((typedEval.stages.afterConvert.blunt || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.afterConvert.slash || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.afterConvert.pierce || 0) * 100) / 100,
                'P2:' + Math.round((typedEval.stages.afterIncrease2.blunt || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.afterIncrease2.slash || 0) * 100) / 100 + '/' + Math.round((typedEval.stages.afterIncrease2.pierce || 0) * 100) / 100
            ].join(' ')
        }, 'combat');

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
            typedDamage = createEmptyTypedDamage();
        }

        var qiSpent = 0;
        var diqiSpent = 0;
        var deferSpend = !!opts.deferResourceSpend;
        if (!deferSpend) {
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
        }

        return {
            rawDamage: rawDamage,
            typedDamage: typedDamage,
            hitRollSuccess: hitRollSuccess,
            hitPart: hitPart,
            damageType: damageType,
            skillId: skillId,
            moveId: moveId,
            limbId: limbId,
            powerLevel: powerK,
            hitPartModifierKey: mapHitPartToModifierKey(hitPart),
            wSkill: dmgBonusMult * independentMult,
            wCoef: dmgBonusMult,
            skillTotalMult: 1,
            expMult: independentMult,
            combatExperience: combatExpVal,
            increasedSum: increasedSum,
            decreasedSum: decreasedSum,
            moreSum: moreSum,
            lessSum: lessSum,
            moveProfRatio: Rmove,
            skillTotalProfRatio: 0,
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
            proficiencyDelta: 1,
            deferredResourceSpend: deferSpend,
            qiIntendedForCommit: qiIntended,
            diqiIntendedForCommit: diqiIntended
        };
    }

    /**
     * 敌人还击玩家：命中用敌速攻、玩家速防；伤害来自 combat-enemies 模板 attack_damage_min/max（缺省 6～14）。
     */
    function resolveEnemyVsPlayerAttack(opts) {
        opts = opts || {};
        var enemyId = opts.enemyId;
        var CE = global.CombatEnemies;
        var CA = global.CharacterAttributes;
        var tpl = CE && typeof CE.getById === 'function' ? CE.getById(enemyId) : null;
        var Vatk = opts.attackerSpeed != null ? Number(opts.attackerSpeed) : (tpl && tpl.speed != null ? Number(tpl.speed) : 10);
        if (!isFinite(Vatk) || Vatk < 1) Vatk = 10;
        var Vdef = CA && typeof CA.getCombatSpeed === 'function' ? CA.getCombatSpeed() : 1;
        if (!isFinite(Vdef) || Vdef < 1) Vdef = 1;
        var P = CA && typeof CA.getHitRate === 'function' ? CA.getHitRate(Vatk, Vdef) : 0.8;
        var hitRollSuccess = Math.random() < P;
        logLine('log.combat.resolve.hit', {
            vAtk: String(Math.floor(Vatk)),
            vDef: String(Math.floor(Vdef)),
            pct: String(Math.round(P * 1000) / 10),
            result: hitRollSuccess ? tUi('log.combat.resolve.hit_ok') : tUi('log.combat.resolve.hit_miss')
        }, 'combat');

        var dmgMin = tpl && tpl.attack_damage_min != null ? Number(tpl.attack_damage_min) : 6;
        var dmgMax = tpl && tpl.attack_damage_max != null ? Number(tpl.attack_damage_max) : 14;
        if (!isFinite(dmgMin)) dmgMin = 6;
        if (!isFinite(dmgMax)) dmgMax = 14;
        if (dmgMax < dmgMin) {
            var tmp = dmgMin;
            dmgMin = dmgMax;
            dmgMax = tmp;
        }
        var rawDamage = hitRollSuccess ? Math.floor(dmgMin + Math.random() * (dmgMax - dmgMin + 1)) : 0;
        var damageType = normalizeDamageType((tpl && tpl.attack_damage_type) ? String(tpl.attack_damage_type) : 'blunt');
        var typedDamage = createEmptyTypedDamage();
        typedDamage[damageType] = rawDamage;
        var skId = global.CombatInitiative && typeof global.CombatInitiative.getEnemyAttackSkillId === 'function'
            ? global.CombatInitiative.getEnemyAttackSkillId() : '__enemy_counter_attack__';
        var mvId = global.CombatInitiative && typeof global.CombatInitiative.getEnemyAttackMoveId === 'function'
            ? global.CombatInitiative.getEnemyAttackMoveId() : 'enemy_counter_strike';

        return {
            rawDamage: rawDamage,
            typedDamage: typedDamage,
            hitRollSuccess: hitRollSuccess,
            hitPart: 'chest',
            damageType: damageType,
            skillId: skId,
            moveId: mvId,
            limbId: 'rhand',
            powerLevel: 10,
            hitPartModifierKey: mapHitPartToModifierKey('chest'),
            hitChance: P,
            qiIntended: 0,
            qiSpent: 0,
            diqiIntended: 0,
            diqiSpent: 0,
            forceZeroDamageByResourceInsufficient: false,
            proficiencyDelta: 0,
            deferredResourceSpend: false,
            qiIntendedForCommit: 0,
            diqiIntendedForCommit: 0
        };
    }

    /** 同速同时提交：在两侧 dry 管线结束后扣玩家本击气力/底气 */
    function applyDeferredResourceSpendFromResolveResult(r) {
        if (!r || !r.deferredResourceSpend) return;
        var Surv = global.Survival;
        var qiIntended = r.qiIntendedForCommit != null ? Number(r.qiIntendedForCommit) : Number(r.qiIntended) || 0;
        var diqiIntended = r.diqiIntendedForCommit != null ? Number(r.diqiIntendedForCommit) : Number(r.diqiIntended) || 0;
        if (Surv && typeof Surv.consumeQiLi === 'function' && qiIntended > 0) {
            Surv.consumeQiLi(qiIntended);
        }
        if (Surv && typeof Surv.consumeDiqi === 'function' && diqiIntended > 0) {
            Surv.consumeDiqi(diqiIntended);
        }
    }

    global.CombatMeleeResolve = {
        computeIntendedResourceCost: computeIntendedResourceCost,
        mapHitPartToModifierKey: mapHitPartToModifierKey,
        limbToWeaponSlot: limbToWeaponSlot,
        getWeaponAttackPowerForLimb: getWeaponAttackPowerForLimb,
        getWeaponSkillCoefForLimb: getWeaponSkillCoefForLimb,
        resolvePlayerVsEnemyAttack: resolvePlayerVsEnemyAttack,
        resolveEnemyVsPlayerAttack: resolveEnemyVsPlayerAttack,
        applyDeferredResourceSpendFromResolveResult: applyDeferredResourceSpendFromResolveResult
    };
})(typeof window !== 'undefined' ? window : this);
