/**
 * 敌人战斗模板：招架默认值、是否可反击、部位是否吃损毁（测试木桩可 invulnerable）。
 * 数据：data/combat-enemies.json
 */
(function (global) {
    'use strict';

    var table = { enemies: {} };
    var facingByKey = {};

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

    function normalizeDir(v) {
        var n = Number(v);
        if (!isFinite(n)) return 4;
        n = Math.round(n) % 8;
        if (n < 0) n += 8;
        return n;
    }

    function dirFromDelta(dx, dy) {
        var x = Number(dx) || 0;
        var y = Number(dy) || 0;
        if (!x && !y) return 4;
        if (x > 0 && y < 0) return 1;
        if (x > 0 && y > 0) return 3;
        if (x < 0 && y > 0) return 5;
        if (x < 0 && y < 0) return 7;
        if (x > 0) return 2;
        if (x < 0) return 6;
        if (y < 0) return 0;
        return 4;
    }

    function facingKey(enemyId, mapId, x, y) {
        return String(mapId || '') + '|' + String(enemyId || '') + '|' + String(x | 0) + ',' + String(y | 0);
    }

    function setFacingDir(enemyId, mapId, x, y, dir) {
        if (!enemyId) return 4;
        var k = facingKey(enemyId, mapId, x, y);
        facingByKey[k] = normalizeDir(dir);
        return facingByKey[k];
    }

    function getFacingDir(enemyId, mapId, x, y, fallback) {
        if (!enemyId) return normalizeDir(fallback);
        var k = facingKey(enemyId, mapId, x, y);
        if (facingByKey[k] == null) return normalizeDir(fallback);
        return normalizeDir(facingByKey[k]);
    }

    function ensureFacingTowardTarget(enemyId, mapId, x, y, targetX, targetY) {
        if (!enemyId) return 4;
        var k = facingKey(enemyId, mapId, x, y);
        if (facingByKey[k] == null) {
            facingByKey[k] = dirFromDelta((targetX | 0) - (x | 0), (targetY | 0) - (y | 0));
        }
        return normalizeDir(facingByKey[k]);
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
        defender.flexibility = Math.max(0, Number(t.flexibility) || 0);
        defender.armor = t.armor || {};
        defender.head_armor = t.head_armor || {};
        if (t.parry_damage_reduce != null) defender.parry_damage_reduce = Number(t.parry_damage_reduce);
        if (t.speed != null && isFinite(Number(t.speed))) defender.speed = Number(t.speed);
        if (t.inner_damage_reduce != null && isFinite(Number(t.inner_damage_reduce))) defender.inner_damage_reduce = clamp01(Number(t.inner_damage_reduce));
        if (t.body_damage_reduce != null && isFinite(Number(t.body_damage_reduce))) defender.body_damage_reduce = clamp01(Number(t.body_damage_reduce));
        if (t.limbs_invulnerable === true) defender.limbs_invulnerable = true;
        if (t.can_attack === false) defender.can_attack = false;
        if (Array.isArray(t.counter_post_effect_ids)) defender.counter_post_effect_ids = t.counter_post_effect_ids.slice();
        if (defender.speed == null || !isFinite(Number(defender.speed))) defender.speed = 10;
        if (defender.inner_damage_reduce == null) defender.inner_damage_reduce = 0;
        if (defender.body_damage_reduce == null) defender.body_damage_reduce = 0;
        return defender;
    }

    // ---- 敌人实例状态（部位损毁 / 死亡；「损毁即血」模型，按 mapId|i{index} 键，与 AI 状态同键体系）----
    // 敌人无独立 HP：七部位损毁即血量。致命区（头/胸/腹）任一损毁满 = 死亡；或七部位全毁 = 死亡。
    // 四肢损毁满 = 失能（手毁→该肢动作不可用；腿毁→不能移动）。敌人实例无持久存档：同地图内持续，地图重载/刷新后重建。
    var enemyInstanceStates = {}; // key -> { part_destroy:{...}, maxes:{...}, dead:false }
    var enemyKillQueue = {}; // key -> enemyId（等待场景侧 drain 后移除）
    var enemyLimbLossQueue = {}; // key -> { enemyId, parts:[运行时部位键] }（部位被打满瞬间，等待场景侧输出失能日志）

    var PART_ORDER = ['head', 'chest', 'abdomen', 'lhand', 'rhand', 'lfoot', 'rfoot'];
    var LETHAL_PARTS = ['head', 'chest', 'abdomen'];
    var CANON_TO_DESTROY_KEY = {
        head: 'head', chest: 'chest',
        abdomen: 'abdomen', belly: 'abdomen',
        left_arm: 'lhand', lhand: 'lhand',
        right_arm: 'rhand', rhand: 'rhand',
        left_leg: 'lfoot', lfoot: 'lfoot',
        right_leg: 'rfoot', rfoot: 'rfoot'
    };

    function normalizeDestroyKey(rawId) {
        var k = String(rawId || '').trim();
        return CANON_TO_DESTROY_KEY[k] || k;
    }

    function createEmptyPartDestroy() {
        return { head: 0, chest: 0, abdomen: 0, lhand: 0, rhand: 0, lfoot: 0, rfoot: 0 };
    }

    function getEnemyInstanceKey(mapId, index) {
        return String(mapId == null ? '' : mapId) + '|i' + (index | 0);
    }

    /**
     * 敌人部位损毁上限：优先敌人模板 `body_part_destroy_max`（脆皮化，损毁即血）；
     * 未配置时回退与主角共用上限（10-enemies 原约定）——未配表敌人（木桩/陪练）保持打不坏。
     */
    function computePartMax(pk, tpl) {
        if (tpl && tpl.body_part_destroy_max && typeof tpl.body_part_destroy_max === 'object') {
            var tv = tpl.body_part_destroy_max[pk];
            if (tv != null && isFinite(Number(tv)) && Number(tv) > 0) return Math.floor(Number(tv));
        }
        if (global.CharacterAttributes && typeof global.CharacterAttributes.getBodyPartDestroyMax === 'function') {
            try { return global.CharacterAttributes.getBodyPartDestroyMax(pk); } catch (e) { /* fallthrough */ }
        }
        if (pk === 'head') return 50;
        if (pk === 'abdomen') return 80;
        return 100;
    }

    function getEnemyInstanceState(mapId, index, enemyId) {
        var key = getEnemyInstanceKey(mapId, index);
        var st = enemyInstanceStates[key];
        if (!st) {
            st = {
                enemyId: enemyId != null ? String(enemyId) : null,
                part_destroy: createEmptyPartDestroy(),
                maxes: null,
                dead: false,
                // 眩晕累积（37 §9.2，k13）：0-100；stunned=true = 晕 1 回合（下次 AI 行动被跳过）
                stun_value: 0,
                stunned: false,
                // 疼痛（47 §9.6 / k229，敌我通用）：全局 0-100 整数条；上限 = pain_cap_base + pain_cap_per_avg_destroy×平均损毁%（封顶制）
                pain_value: 0,
                pain_no_hit_ticks: 0
            };
            enemyInstanceStates[key] = st;
        }
        if (!st.maxes) {
            var tpl = st.enemyId ? getById(st.enemyId) : null;
            st.maxes = {};
            for (var i = 0; i < PART_ORDER.length; i++) st.maxes[PART_ORDER[i]] = computePartMax(PART_ORDER[i], tpl);
        }
        return st;
    }

    /** 敌人眩晕累积（37 §9.2）：命中头基础眩晕值（技能/全局配置）；≥100 → 归 0 + 晕 1 回合 */
    function addEnemyStun(mapId, index, enemyId, amount) {
        var st = getEnemyInstanceState(mapId, index, enemyId);
        var a = Math.max(0, Math.floor(Number(amount) || 0));
        if (a <= 0) return { triggered: false, value: st.stun_value || 0 };
        st.stun_value = Math.min(100, (st.stun_value || 0) + a);
        var triggered = false;
        if (st.stun_value >= 100) {
            st.stun_value = 0;
            st.stunned = true;
            triggered = true;
        }
        return { triggered: triggered, value: st.stun_value };
    }

    function isEnemyStunned(mapId, index) {
        var st = enemyInstanceStates[getEnemyInstanceKey(mapId, index)];
        return !!(st && st.stunned);
    }

    function getEnemyStunValue(mapId, index) {
        var st = enemyInstanceStates[getEnemyInstanceKey(mapId, index)];
        return st ? Math.max(0, Math.min(100, Math.floor(Number(st.stun_value) || 0))) : 0;
    }

    /** 敌人抗眩晕豁免%（37 §9.2：头防具专属；精英敌人模板 anti_stun_pct，普通敌人 0），封顶 stun_resist_cap */
    function getEnemyAntiStunPct(tpl) {
        if (!tpl || tpl.anti_stun_pct == null) return 0;
        var v = Number(tpl.anti_stun_pct);
        if (!isFinite(v) || v < 0) return 0;
        var cap = 0.6;
        try {
            if (global.CharacterAttributes && typeof global.CharacterAttributes.getCfg === 'function') {
                var c = Number(global.CharacterAttributes.getCfg('stun_resist_cap', 0.6));
                if (isFinite(c) && c >= 0) cap = c;
            }
        } catch (eC) { /* ignore */ }
        return Math.min(cap, v);
    }

    /** 敌人受击命中头的基础眩晕值（k13，37 §9.2）：攻击技能 stun_head_hit 优先，否则全局 stun_head_hit_base；钝击 ×stun_head_hit_blunt_mult */
    function enemyStunBaseForHit(skillId, moveId, damageType) {
        var base = 35;
        var found = false;
        if (skillId && global.CombatSkills && typeof global.CombatSkills.getSkill === 'function') {
            try {
                var sk = global.CombatSkills.getSkill(skillId);
                if (sk) {
                    if (moveId && Array.isArray(sk.moves)) {
                        for (var mi = 0; mi < sk.moves.length; mi++) {
                            var mvTpl = sk.moves[mi];
                            if (mvTpl && mvTpl.id === moveId && mvTpl.stun_head_hit != null) {
                                var mv = Number(mvTpl.stun_head_hit);
                                if (isFinite(mv) && mv >= 0) { base = Math.floor(mv); found = true; }
                                break;
                            }
                        }
                    }
                    if (!found && sk.stun_head_hit != null) {
                        var sv = Number(sk.stun_head_hit);
                        if (isFinite(sv) && sv >= 0) { base = Math.floor(sv); found = true; }
                    }
                }
            } catch (eS) { /* ignore */ }
        }
        if (!found && global.CharacterAttributes && typeof global.CharacterAttributes.getCfg === 'function') {
            var b = Number(global.CharacterAttributes.getCfg('stun_head_hit_base', 35));
            if (isFinite(b) && b >= 0) base = Math.floor(b);
        }
        if ((damageType || 'blunt') === 'blunt') {
            var mult = 1.5;
            if (global.CharacterAttributes && typeof global.CharacterAttributes.getCfg === 'function') {
                var m = Number(global.CharacterAttributes.getCfg('stun_head_hit_blunt_mult', 1.5));
                if (isFinite(m) && m > 0) mult = m;
            }
            base = Math.round(base * mult);
        }
        return base;
    }

    function isEnemyDead(mapId, index) {
        var st = enemyInstanceStates[getEnemyInstanceKey(mapId, index)];
        return !!(st && st.dead);
    }

    function isEnemyPartDestroyed(mapId, index, partId, enemyId) {
        var st = enemyInstanceStates[getEnemyInstanceKey(mapId, index)];
        if (!st) return false;
        var k = normalizeDestroyKey(partId);
        if (PART_ORDER.indexOf(k) < 0) return false;
        var mx = st.maxes
            ? st.maxes[k]
            : computePartMax(k, (st.enemyId ? getById(st.enemyId) : null) || (enemyId ? getById(enemyId) : null));
        return (st.part_destroy[k] || 0) >= mx;
    }

    /** 损毁即血死亡判定：致命区（头/胸/腹）任一损毁满 → 死亡；或七部位全毁 → 死亡（伤害均分后自然导向致命区）。 */
    function isFatallyDestroyed(st) {
        var allFull = true;
        for (var i = 0; i < PART_ORDER.length; i++) {
            var pk = PART_ORDER[i];
            var full = (st.part_destroy[pk] || 0) >= st.maxes[pk];
            if (LETHAL_PARTS.indexOf(pk) >= 0 && full) return true;
            if (!full) allFull = false;
        }
        return allFull;
    }

    /**
     * 09-body-parts「损毁写入」（与主角共用规则）：命中部位未损毁 → Q 全加该部位（封顶）；
     * 已损毁 → Q 均分到未损毁部位（每部位先 floor(Q/n)，余数按 头→胸→腹→左手→右手→左脚→右脚 顺序 +1）。
     * 损毁账与疼痛账并行（k229/47 §9.6）：实际落地损毁增量（顶满溢出作废）同写入该实例疼痛条，
     * 疼痛增量 = round(实际损毁增量 × 汇率)，汇率按「被击中部位受伤前损毁进度」线性（完好 0.1 → 半废 0.55 → 失能 1.0）。
     * @returns {string[]} 本次被打满的部位（运行时键）列表
     */
    function applyEnemyDestroy(mapId, index, hitPartId, q, enemyId) {
        q = Math.max(0, Math.floor(Number(q) || 0));
        if (q <= 0) return [];
        var st = getEnemyInstanceState(mapId, index, enemyId);
        var k = normalizeDestroyKey(hitPartId);
        if (PART_ORDER.indexOf(k) < 0) k = 'chest';
        var filled = [];
        var mx = st.maxes[k];
        var pre = st.part_destroy[k] || 0;
        var appliedTotal = 0;
        function addTo(partKey, amount) {
            var mx2 = st.maxes[partKey];
            var cur2 = st.part_destroy[partKey] || 0;
            if (cur2 >= mx2) return;
            var addv2 = Math.min(amount, mx2 - cur2);
            st.part_destroy[partKey] = cur2 + addv2;
            appliedTotal += addv2;
            if (st.part_destroy[partKey] >= mx2) filled.push(partKey);
        }
        if (pre < mx) {
            addTo(k, q);
        } else {
            var open = [];
            for (var i = 0; i < PART_ORDER.length; i++) {
                var pk = PART_ORDER[i];
                if ((st.part_destroy[pk] || 0) < st.maxes[pk]) open.push(pk);
            }
            if (!open.length) return filled;
            var base = Math.floor(q / open.length);
            var rem = q % open.length;
            for (var j = 0; j < open.length; j++) {
                var ok = open[j];
                var addj = base + (j < rem ? 1 : 0);
                if (addj > 0) addTo(ok, addj);
            }
        }
        if (appliedTotal > 0) {
            try {
                // 有实际损毁落地（顶满溢出不计）即重置疼痛衰减计时；疼痛增量按汇率取整后累加
                st.pain_no_hit_ticks = 0;
                var painInc = 0;
                if (global.Survival && typeof global.Survival.calcPainIncrement === 'function') {
                    painInc = global.Survival.calcPainIncrement(appliedTotal, pre, mx);
                }
                if (painInc > 0) {
                    st.pain_value = Math.min(100, (Math.max(0, Math.floor(Number(st.pain_value) || 0)) + painInc));
                    syncEnemyPainBuff(st);
                }
            } catch (ePain) { /* 疼痛账异常不阻断损毁账 */ }
        }
        return filled;
    }

    // ---- 敌人疼痛（47 §9.6 / k229：敌我通用；纯逻辑字段 + 镜像到 BuffSystem 以便 出手速度乘区/禁用查询/HUD） ----
    var ENEMY_PAIN_BUFF_IDS = ['survival_pain_mild', 'survival_pain_moderate', 'survival_pain_severe', 'survival_pain_agony'];

    function cfgPainNum(key, def) {
        try {
            if (global.CharacterAttributes && typeof global.CharacterAttributes.getCfg === 'function') {
                var v = Number(global.CharacterAttributes.getCfg(key, def));
                if (isFinite(v)) return v;
            }
        } catch (eC) { /* ignore */ }
        return def;
    }

    function getPainBuffTick() {
        try {
            var ts = global.GameTime && typeof global.GameTime.getState === 'function' ? global.GameTime.getState() : null;
            if (ts && typeof ts.totalTicks === 'number' && isFinite(ts.totalTicks)) return Math.max(0, Math.floor(ts.totalTicks));
        } catch (eT) { /* ignore */ }
        return 0;
    }

    /** 平均损毁%（实例七部位 损毁值/上限 均值 ×100；0~100）。 */
    function getEnemyAvgDestroyPct(st) {
        if (!st || !st.maxes) return 0;
        var sum = 0;
        var n = 0;
        var i;
        for (i = 0; i < PART_ORDER.length; i++) {
            var pk = PART_ORDER[i];
            var mxv = st.maxes[pk];
            if (mxv > 0) {
                sum += clamp01((st.part_destroy[pk] || 0) / mxv);
                n += 1;
            }
        }
        return n > 0 ? (sum / n) * 100 : 0;
    }

    /** 疼痛条当前上限（封顶制，够不着高档即不触发）。 */
    function getEnemyPainCap(st) {
        var base = cfgPainNum('pain_cap_base', 25);
        var per = cfgPainNum('pain_cap_per_avg_destroy', 0.75);
        var mxP = cfgPainNum('pain_max', 100);
        return Math.max(0, Math.min(mxP || 100, Math.floor(base + per * getEnemyAvgDestroyPct(st))));
    }

    /** 生效疼痛值 = min(累积 pain, 封顶值)（整数）。 */
    function getEnemyPainEffective(st) {
        return Math.min(Math.max(0, Math.floor(Number(st && st.pain_value) || 0)), getEnemyPainCap(st));
    }

    /** 档位：none/mild/moderate/severe/agony。 */
    function getEnemyPainTierKey(st) {
        var p = getEnemyPainEffective(st);
        var thMild = cfgPainNum('pain_threshold_mild', 25);
        var thMod = cfgPainNum('pain_threshold_moderate', 50);
        var thSev = cfgPainNum('pain_threshold_severe', 75);
        var thAg = cfgPainNum('pain_threshold_agony', 90);
        if (p < thMild) return 'none';
        if (p < thMod) return 'mild';
        if (p < thSev) return 'moderate';
        if (p < thAg) return 'severe';
        return 'agony';
    }

    function enemyPainTierBuffId(tierKey) {
        if (tierKey === 'mild') return 'survival_pain_mild';
        if (tierKey === 'moderate') return 'survival_pain_moderate';
        if (tierKey === 'severe') return 'survival_pain_severe';
        if (tierKey === 'agony') return 'survival_pain_agony';
        return '';
    }

    /** 镜像疼痛档位到 BuffSystem（owner = enemyId）：供战斗交换读 battle_move_speed_multiplier / 禁用查询 / HUD chips；档位离开后移除。 */
    function syncEnemyPainBuff(st) {
        if (!st || !st.enemyId) return '';
        var Buff = global.BuffSystem;
        if (!Buff || typeof Buff.applyBuff !== 'function' || typeof Buff.removeBuffByBuffId !== 'function') return '';
        var tierKey = getEnemyPainTierKey(st);
        var targetId = enemyPainTierBuffId(tierKey);
        var i;
        for (i = 0; i < ENEMY_PAIN_BUFF_IDS.length; i++) {
            var bid = ENEMY_PAIN_BUFF_IDS[i];
            if (bid === targetId) continue;
            if (typeof Buff.hasBuffByBuffId !== 'function' || Buff.hasBuffByBuffId(st.enemyId, bid)) {
                Buff.removeBuffByBuffId(st.enemyId, bid);
            }
        }
        if (targetId) {
            Buff.applyBuff(st.enemyId, targetId, 'pain_system', { tick: getPainBuffTick() });
        }
        return tierKey;
    }

    /** 疼痛衰减（每 AI tick）：未吃有效损毁 pain_decay_grace_ticks tick 后，每 pain_decay_interval_ticks −1（敌我通用，47 §9.6/k229）。 */
    function decayEnemyPain(st) {
        if (!st || (st.pain_value || 0) <= 0) return;
        st.pain_no_hit_ticks = (st.pain_no_hit_ticks || 0) + 1;
        var grace = Math.floor(cfgPainNum('pain_decay_grace_ticks', 10));
        if (!isFinite(grace) || grace < 0) grace = 10;
        var interval = Math.floor(cfgPainNum('pain_decay_interval_ticks', 4));
        if (!isFinite(interval) || interval < 1) interval = 4;
        var step = Math.floor(cfgPainNum('pain_decay_step', 1));
        if (!isFinite(step) || step < 1) step = 1;
        var doDecay = false;
        if (grace <= 0) {
            doDecay = (st.pain_no_hit_ticks % interval) === 0;
        } else if (st.pain_no_hit_ticks > grace) {
            doDecay = ((st.pain_no_hit_ticks - grace) % interval) === 0;
        }
        if (doDecay) {
            st.pain_value = Math.max(0, Math.floor(st.pain_value) - step);
        }
        if ((st.pain_value || 0) <= 0) {
            st.pain_value = 0;
            st.pain_no_hit_ticks = 0;
        }
        syncEnemyPainBuff(st);
    }

    /** 敌人疼痛信息（测试/调试）。 */
    function getEnemyPainInfo(mapId, index) {
        var st = enemyInstanceStates[getEnemyInstanceKey(mapId, index)];
        if (!st) return { stored: 0, cap: 0, effective: 0, tier: 'none' };
        return {
            stored: Math.max(0, Math.floor(Number(st.pain_value) || 0)),
            cap: getEnemyPainCap(st),
            effective: getEnemyPainEffective(st),
            tier: getEnemyPainTierKey(st)
        };
    }

    /** 取走并清空死亡队列（场景侧在攻击结算后调用：移除地图敌人实例、日志等）。 */
    function drainEnemyKillQueue() {
        var out = [];
        var key;
        for (key in enemyKillQueue) {
            if (!Object.prototype.hasOwnProperty.call(enemyKillQueue, key)) continue;
            var m = key.indexOf('|i');
            if (m < 0) continue;
            out.push({ key: key, mapId: key.slice(0, m), index: parseInt(key.slice(m + 2), 10) || 0, enemyId: enemyKillQueue[key] });
        }
        enemyKillQueue = {};
        return out;
    }

    /** 取走并清空「肢体失能」队列（部位被打满瞬间；场景侧输出日志，如「地痞的左手废了」）。 */
    function drainEnemyLimbLossQueue() {
        var out = [];
        var key;
        for (key in enemyLimbLossQueue) {
            if (!Object.prototype.hasOwnProperty.call(enemyLimbLossQueue, key)) continue;
            var m = key.indexOf('|i');
            if (m < 0) continue;
            var rec = enemyLimbLossQueue[key];
            out.push({ key: key, mapId: key.slice(0, m), index: parseInt(key.slice(m + 2), 10) || 0, enemyId: rec.enemyId, parts: rec.parts.slice() });
        }
        enemyLimbLossQueue = {};
        return out;
    }

    /**
     * 伤害占位结算之后（管线 damage_stub / finalizeSimultaneousStrike 调用）：
     * 「损毁即血」：命中部位损毁累积（09 规则）→ 肢体失能日志入队（部位打满瞬间）→ 死亡判定（致命区任一满或全毁）。
     * limbs_invulnerable 的木桩跳过。需 ctx.defender 携带 mapId / index（场景攻击方构建 defender 时写入）。
     */
    function onEnemyDamageResolved(ctx) {
        var d = ctx && ctx.defender;
        if (!d || d.kind !== 'enemy') return;
        var tpl = getById(d.enemyId);
        if (tpl && tpl.limbs_invulnerable) return;
        var mapId = d.mapId != null ? d.mapId : (ctx.mapId != null ? ctx.mapId : null);
        var index = d.index != null ? parseInt(d.index, 10) : -1;
        if (mapId == null || index < 0) return; // 无场景实例键（测试/无 map 上下文）→ 跳过
        var dmg = Math.max(0, Math.floor(Number(ctx.finalDamage) || 0));
        if (dmg <= 0 || ctx.hitRollSuccess === false) return;
        // 管线约定 hitPart 在 ctx 顶层（buildPlayerAtkCtx）；兼容旧 defender 携带
        var hitPart = ctx.hitPart != null ? ctx.hitPart : d.hitPart;
        var filled = applyEnemyDestroy(mapId, index, hitPart, dmg, d.enemyId);
        var key = getEnemyInstanceKey(mapId, index);
        if (filled && filled.length) {
            var prev = enemyLimbLossQueue[key];
            enemyLimbLossQueue[key] = { enemyId: String(d.enemyId), parts: (prev ? prev.parts : []).concat(filled) };
        }
        var st = enemyInstanceStates[key];
        if (st && !st.dead && isFatallyDestroyed(st)) {
            st.dead = true;
            enemyKillQueue[key] = String(d.enemyId);
            // 敌人死亡：清掉镜像的疼痛档位 buff（避免残留 chip/查询）
            try {
                if (global.BuffSystem && typeof global.BuffSystem.removeBuffByBuffId === 'function') {
                    for (var pbi = 0; pbi < ENEMY_PAIN_BUFF_IDS.length; pbi++) {
                        global.BuffSystem.removeBuffByBuffId(String(d.enemyId), ENEMY_PAIN_BUFF_IDS[pbi]);
                    }
                }
            } catch (ePb) { /* ignore */ }
        }
        if (ctx.collisionDamage) return;
        // 眩晕累积（37 §9.2，k13）：命中头大幅累积（抗眩晕比例减免）；技能可显式声明其他部位眩晕
        try {
            var stunGain = 0;
            var hitPartCanon = normalizeDestroyKey(hitPart);
            var atkSkillId = ctx && ctx.skillId;
            if (hitPartCanon === 'head') {
                stunGain = enemyStunBaseForHit(atkSkillId, ctx && ctx.moveId, ctx && ctx.damageType);
            } else if (atkSkillId && global.CombatSkills && typeof global.CombatSkills.getSkill === 'function') {
                try {
                    var atkSkillTpl = global.CombatSkills.getSkill(atkSkillId);
                    if (atkSkillTpl && atkSkillTpl.stun_per_part && typeof atkSkillTpl.stun_per_part === 'object') {
                        stunGain = Math.max(0, Math.floor(Number(atkSkillTpl.stun_per_part[hitPartCanon]) || 0));
                    }
                } catch (eAS) { /* ignore */ }
            }
            if (stunGain > 0) {
                var eTpl = getById(d.enemyId);
                var resistE = getEnemyAntiStunPct(eTpl);
                var netE = Math.max(1, Math.round(stunGain * (1 - resistE)));
                var rE = addEnemyStun(mapId, index, d.enemyId, netE);
                if (global.GameLog && typeof global.GameLog.log === 'function' && global.UIText && typeof global.UIText.t === 'function') {
                    try {
                        global.GameLog.log(global.UIText.t('combat.log.stun_enemy_head_hit', {
                            enemyId: String(d.enemyId),
                            gain: String(stunGain),
                            resist: String(Math.round(resistE * 100)),
                            net: String(netE),
                            value: String(rE.value)
                        }), 'damage');
                    } catch (eL2) { /* ignore */ }
                }
                if (rE.triggered && global.GameLog && typeof global.GameLog.log === 'function' && global.UIText && typeof global.UIText.t === 'function') {
                    try {
                        global.GameLog.log(global.UIText.t('combat.log.stun_enemy_triggered', {}), 'system');
                    } catch (eT2) { /* ignore */ }
                }
            }
        } catch (eStun) { /* ignore */ }
    }

    // ---- 敌人攻击动作系统（10-enemies：攻击动作列表 + 敌人气力条）----
    // 敌人气力运行时状态按 enemy_id 键；敌人实例无持久存档前为「按类型共享」近似（10-enemies 已知边界）。
    var enemyQiState = {}; // enemyId -> { current, max }

    function regenEnemyQi(enemyId) {
        var t = getById(enemyId);
        if (!t) return 0;
        var max = Number(t.qi_li_max) || 0;
        var regen = Number(t.qi_li_regen_per_turn) || 0;
        var st = enemyQiState[enemyId] || (enemyQiState[enemyId] = { current: 0, max: max });
        st.max = max;
        if (regen > 0) st.current = Math.min(max, st.current + regen);
        return st.current;
    }

    function getEnemyQi(enemyId) {
        var t = getById(enemyId);
        var max = t ? (Number(t.qi_li_max) || 0) : 0;
        var st = enemyQiState[enemyId];
        if (!st) return { current: 0, max: max };
        st.max = max;
        if (st.current > max) st.current = max;
        return { current: st.current, max: max };
    }

    function consumeEnemyQi(enemyId, cost) {
        cost = parseInt(cost, 10) || 0;
        if (cost <= 0) return 0;
        var st = enemyQiState[enemyId];
        if (!st) return 0;
        var spent = Math.min(st.current, cost);
        st.current -= spent;
        return spent;
    }

    /** 按动作 hit_part_weights 抽样命中部位；返回战斗规范部位空间（head/chest/abdomen/left_arm/right_arm/left_leg/right_leg，与 CombatParry/mapHitPartToModifierKey 一致）。
     *  权重键可写规范名（left_arm 等）或运行时名（lhand 等），二者等价；缺省或全 0 取 'chest'。 */
    function sampleHitPartForAction(action) {
        var w = action && action.hit_part_weights;
        if (!w || typeof w !== 'object') return 'chest';
        var NORM = {
            head: 'head', chest: 'chest',
            belly: 'abdomen', abdomen: 'abdomen',
            lhand: 'left_arm', left_arm: 'left_arm',
            rhand: 'right_arm', right_arm: 'right_arm',
            lfoot: 'left_leg', left_leg: 'left_leg',
            rfoot: 'right_leg', right_leg: 'right_leg'
        };
        var CANON = ['head', 'chest', 'abdomen', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
        var total = {};
        var sum = 0;
        var k;
        for (k in w) {
            if (!Object.prototype.hasOwnProperty.call(w, k)) continue;
            var c = NORM[String(k).trim()];
            if (!c) continue;
            var v = Number(w[k]) || 0;
            if (v < 0) v = 0;
            total[c] = (total[c] || 0) + v;
        }
        var i;
        for (i = 0; i < CANON.length; i++) sum += total[CANON[i]] || 0;
        if (sum <= 0) return 'chest';
        var r = Math.random() * sum;
        var acc = 0;
        for (i = 0; i < CANON.length; i++) {
            var v2 = total[CANON[i]] || 0;
            if (v2 <= 0) continue;
            acc += v2;
            if (r < acc) return CANON[i];
        }
        return 'chest';
    }

    /**
     * 选一次还击动作：先按 qi_li_regen_per_turn 回气，再在「气力可负担」的动作中随机选一条。
     * 传 mapId/index（实例键）时过滤「装备肢体已损毁」的动作（10-enemies：肢体损毁则该肢动作不可用）。
     * 无 actions、或全部动作气力不足/肢体已毁时返回 null（调用方回退 attack_damage_* 通用还击）。
     */
    function pickEnemyAction(enemyId, mapId, index) {
        var t = getById(enemyId);
        if (!t || !Array.isArray(t.actions) || !t.actions.length) return null;
        regenEnemyQi(enemyId);
        var qi = getEnemyQi(enemyId);
        var pool = [];
        var i, a, cost;
        for (i = 0; i < t.actions.length; i++) {
            a = t.actions[i] || {};
            cost = parseInt(a.qi_cost, 10) || 0;
            if (cost <= qi.current) {
                if (mapId != null && index != null && index >= 0 && isEnemyPartDestroyed(mapId, index, a.limb, enemyId)) continue;
                pool.push(a);
            }
        }
        if (!pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // ---- 敌人 AI（主动追击与攻击；纯逻辑，由 scene-app tick 钩子调用并落地）----
    // 实例态按 mapId|enemies[] 下标 键（位置变化不影响身份；地图重载会重建）。
    var enemyAiState = {}; // key -> { lastMoveTick, lastAttackTick, aggro, homeX, homeY }

    function enemyAiKey(mapId, index) {
        return String(mapId || '') + '|i' + (index | 0);
    }

    /** 主动攻击等外部事件直接建立仇恨；protectThroughTick 防止同一行动因距离立刻清除。 */
    function forceAggro(map, index, protectThroughTick) {
        if (!map || !Array.isArray(map.enemies)) return false;
        var rec = map.enemies[index | 0];
        if (!rec || !rec.enemy_id) return false;
        var key = enemyAiKey(map.map_id, index);
        var st = enemyAiState[key] || (enemyAiState[key] = {
            lastMoveTick: 0, aggro: false, homeX: rec.x | 0, homeY: rec.y | 0
        });
        st.aggro = true;
        st.protectThroughTick = Math.max(parseInt(st.protectThroughTick, 10) || 0, parseInt(protectThroughTick, 10) || 0);
        return true;
    }

    function isEnemyAggro(mapId, index) {
        var st = enemyAiState[enemyAiKey(mapId, index)];
        return !!(st && st.aggro);
    }

    /** enemies[] 删除一项后同步按下标存放的 AI 状态，避免后续实例继承错误仇恨。 */
    function removeEnemyAiStateAt(mapId, removedIndex) {
        var prefix = String(mapId || '') + '|i';
        var moved = {};
        Object.keys(enemyAiState).forEach(function (key) {
            if (key.indexOf(prefix) !== 0) return;
            var index = parseInt(key.slice(prefix.length), 10);
            var value = enemyAiState[key];
            delete enemyAiState[key];
            if (!isFinite(index) || index === removedIndex) return;
            moved[prefix + (index > removedIndex ? index - 1 : index)] = value;
        });
        Object.keys(moved).forEach(function (key) { enemyAiState[key] = moved[key]; });
    }

    function aiMoveInterval(tpl) {
        var v = parseInt(tpl && tpl.move_interval_ticks, 10);
        return isFinite(v) && v >= 1 ? v : 1;
    }

    function aiRadius(tpl, field, def) {
        var v = parseInt(tpl && tpl[field], 10);
        return isFinite(v) && v >= 1 ? v : def;
    }

    /**
     * BFS 寻路：找到可达目标邻格（距离≤1）的最短路，返回第一步。
     * 深度上限默认 1000（覆盖 16×16 地图全图）；不可达返回 null（原地待机）。
     * 纯 BFS（非贪心）避免「贪心 vs BFS 第一步方向打架」导致的来回振荡。
     * @param {object} o 同 updateEnemyAI
     * @param {number} x y 当前
     * @param {number} tx ty 目标
     * @param {number} skipIdx 自身在 map.enemies 的下标
     * @param {number} [maxDepth] 搜索深度上限（默认 1000）
     */
    function bfsFirstStep(o, x, y, tx, ty, skipIdx, maxDepth) {
        maxDepth = parseInt(maxDepth, 10) > 0 ? parseInt(maxDepth, 10) : 1000;
        var start = x + ',' + y;
        var prev = {};
        var seen = {};
        var queue = [{ x: x, y: y }];
        var head = 0;
        seen[start] = true;
        while (head < queue.length) {
            var cur = queue[head++];
            if ((cur.x !== x || cur.y !== y) && Math.max(Math.abs(cur.x - tx), Math.abs(cur.y - ty)) <= 1) {
                // 到达目标邻格：回溯到第一步
                var c = cur;
                while (prev[c.x + ',' + c.y] && (prev[c.x + ',' + c.y].x !== x || prev[c.x + ',' + c.y].y !== y)) {
                    c = prev[c.x + ',' + c.y];
                }
                return { x: c.x, y: c.y };
            }
            if (Math.max(Math.abs(cur.x - x), Math.abs(cur.y - y)) >= maxDepth) continue;
            var dx, dy;
            for (dx = -1; dx <= 1; dx++) {
                for (dy = -1; dy <= 1; dy++) {
                    if (!dx && !dy) continue;
                    var nx = cur.x + dx, ny = cur.y + dy;
                    var k = nx + ',' + ny;
                    if (seen[k]) continue;
                    if (o.isWalkable && !o.isWalkable(nx, ny)) continue;
                    if (nx === o.playerX && ny === o.playerY) continue;
                    if (o.isBlockedByOther && o.isBlockedByOther(nx, ny, skipIdx)) continue;
                    seen[k] = true;
                    prev[k] = { x: cur.x, y: cur.y };
                    queue.push({ x: nx, y: ny });
                }
            }
        }
        return null;
    }

    /**
     * 敌人 AI 决策（纯逻辑，便于测试；场景落地在 scene-app 的 tickEnemiesAfterWorldTick）：
     * - 玩家进入 aggro_radius（默认 5）→ 追击；贴脸（距离≤1）→ 攻击（每 tick 一次；若本动作内已反击则跳过，由 didActThisTick 去重）
     * - 距离 > leash_radius（默认 8）→ 脱战；脱战后走回出生点（homeX/homeY）
     * - can_attack === false 的敌人（训练木桩）不参与
     * @param {object} o { map, playerX, playerY, tick, isWalkable(x,y), isBlockedByOther(x,y,skipIdx), didActThisTick(index) }
     * @returns {{ moves: Array<{index,enemyId,fromX,fromY,toX,toY}>, attacks: Array<{index,enemyId,x,y}> }}
     */
    function updateEnemyAI(o) {
        var moves = [];
        var attacks = [];
        if (!o || !o.map || !Array.isArray(o.map.enemies)) return { moves: moves, attacks: attacks };
        var tick = parseInt(o.tick, 10) || 0;
        var px = o.playerX, py = o.playerY;
        var i, n;
        for (i = 0; i < o.map.enemies.length; i++) {
            n = o.map.enemies[i] || {};
            var eid = n.enemy_id;
            if (!eid) continue;
            var tpl = getById(eid);
            if (!tpl || tpl.can_attack === false) continue;
            // 眩晕（37 §9.2，k13）：-1/tick 衰减；眩晕中本 tick 无法行动（晕 1 回合，跳过本 tick）
            var instSt = getEnemyInstanceState(o.map.map_id, i, eid);
            if (instSt.stunned) {
                instSt.stunned = false;
                continue;
            }
            if ((instSt.stun_value || 0) > 0) {
                instSt.stun_value = Math.max(0, Math.floor(instSt.stun_value) - 1);
            }
            // 疼痛衰减（47 §9.6 / k229，敌我通用）：未吃有效损毁 grace tick 后每 4 tick −1；镜像 buff 保活/移除
            try { decayEnemyPain(instSt); } catch (ePainTick) { /* ignore */ }
            var painTierKey = getEnemyPainTierKey(instSt);
            var painAgonyNow = painTierKey === 'agony';
            var ex = n.x | 0, ey = n.y | 0;
            var key = enemyAiKey(o.map.map_id, i);
            var st = enemyAiState[key] || (enemyAiState[key] = { lastMoveTick: 0, aggro: false, homeX: ex, homeY: ey });
            var dist = Math.max(Math.abs(ex - px), Math.abs(ey - py));
            var aggroR = aiRadius(tpl, 'aggro_radius', 5);
            var leashR = aiRadius(tpl, 'leash_radius', 8);
            var homeDist = Math.max(Math.abs(ex - st.homeX), Math.abs(ey - st.homeY));
            if (dist <= aggroR) st.aggro = true;
            if (st.aggro && dist > leashR && tick > (parseInt(st.protectThroughTick, 10) || 0)) st.aggro = false;
            var returning = !st.aggro && homeDist > 1;
            if (!st.aggro && !returning && dist > aggroR) continue;
            // 攻击：贴脸即攻击（无冷却）；若本玩家动作内该敌人已反击（didActThisTick），跳过——敌人每 tick 恰好行动 1 次
            if (st.aggro && dist <= 1 && !(o.didActThisTick && o.didActThisTick(i))) {
                attacks.push({ index: i, enemyId: eid, x: ex, y: ey });
                continue;
            }
            // 移动：追击或回巢（BFS 最短路径）；贴脸时原地待机（等下次未反击的 tick 出手），不绕圈
            // 腿毁失能（损毁即血）：任一条腿损毁满 → 不再移动（原地待机，只保留攻击）
            // 剧痛（k229/47 §9.6）：pain≥90 → disable_actions(move)，痛到走不动（保留贴脸攻击）
            var legsDisabled = false;
            try {
                legsDisabled = isEnemyPartDestroyed(o.map.map_id, i, 'lfoot', eid) || isEnemyPartDestroyed(o.map.map_id, i, 'rfoot', eid);
            } catch (eLeg) { /* ignore */ }
            if (!legsDisabled && !painAgonyNow && dist > 1 && tick - st.lastMoveTick >= aiMoveInterval(tpl)) {
                var tx = st.aggro ? px : st.homeX;
                var ty = st.aggro ? py : st.homeY;
                if (tx === ex && ty === ey) continue;
                if (!st.aggro && homeDist <= 1) continue;
                var next = bfsFirstStep(o, ex, ey, tx, ty, i, 1000);
                if (next) {
                    st.lastMoveTick = tick;
                    moves.push({ index: i, enemyId: eid, fromX: ex, fromY: ey, toX: next.x, toY: next.y });
                }
            }
        }
        return { moves: moves, attacks: attacks };
    }

    global.CombatEnemies = {
        getShieldRemaining: function (mapId, index, enemyId) {
            var st = getEnemyInstanceState(mapId, index, enemyId);
            if (st.shield_remaining == null) st.shield_remaining = Math.max(0, Number((getById(enemyId) || {}).shield_remaining) || 0);
            return st.shield_remaining;
        },
        setShieldRemaining: function (mapId, index, enemyId, amount) {
            getEnemyInstanceState(mapId, index, enemyId).shield_remaining = Math.max(0, Number(amount) || 0);
        },
        setTable: setTable,
        getById: getById,
        setFacingDir: setFacingDir,
        getFacingDir: getFacingDir,
        ensureFacingTowardTarget: ensureFacingTowardTarget,
        mergeIntoDefender: mergeIntoDefender,
        onEnemyDamageResolved: onEnemyDamageResolved,
        pickEnemyAction: pickEnemyAction,
        sampleHitPartForAction: sampleHitPartForAction,
        getEnemyQi: getEnemyQi,
        consumeEnemyQi: consumeEnemyQi,
        regenEnemyQi: regenEnemyQi,
        isEnemyDead: isEnemyDead,
        isEnemyPartDestroyed: isEnemyPartDestroyed,
        addEnemyStun: addEnemyStun,
        isEnemyStunned: isEnemyStunned,
        getEnemyStunValue: getEnemyStunValue,
        getEnemyPainInfo: getEnemyPainInfo,
        applyEnemyDestroy: applyEnemyDestroy,
        drainEnemyKillQueue: drainEnemyKillQueue,
        drainEnemyLimbLossQueue: drainEnemyLimbLossQueue,
        forceAggro: forceAggro,
        isEnemyAggro: isEnemyAggro,
        removeEnemyAiStateAt: removeEnemyAiStateAt,
        updateEnemyAI: updateEnemyAI,
        bfsFirstStep: bfsFirstStep,
        dirFromDelta: dirFromDelta
    };
})(typeof window !== 'undefined' ? window : this);
