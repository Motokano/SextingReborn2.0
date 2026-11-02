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
        if (e && e.boss && global.CombatEnemyBoss) global.CombatEnemyBoss.prepare(e);
        if (e && e.thug && global.CombatEnemyThug) global.CombatEnemyThug.prepare(e);
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
        defender.ownerId = ownerOf(defender);
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

    // Slots follow the map array; ownerId is stable across movement, removal and saves.
    var enemyInstanceStates = {}; // key -> { part_destroy:{...}, maxes:{...}, dead:false }
    var instanceSequence = 0;
    var worldTurnTick = null;
    var mapBaselines = {};
    var enemyLimbRecoveryQueue = {};
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
     * 缺项使用固定七部位默认值，不读取主角属性；无敌必须显式声明 limbs_invulnerable。
     */
    function computePartMax(pk, tpl) {
        if (tpl && tpl.body_part_destroy_max && typeof tpl.body_part_destroy_max === 'object') {
            var tv = tpl.body_part_destroy_max[pk];
            if (tv != null && isFinite(Number(tv)) && Number(tv) > 0) return Math.max(1,Math.floor(Number(tv)));
        }
        if (pk === 'head') return 50;
        if (pk === 'abdomen') return 80;
        return 100;
    }

    function getEnemyInstanceState(mapId, index, enemyId) {
        var key = getEnemyInstanceKey(mapId, index);
        rememberMap(mapId);
        var st = enemyInstanceStates[key];
        if (st && enemyId != null && st.enemyId !== String(enemyId)) {
            clearOwnerBuffs(st.ownerId);
            delete enemyInstanceStates[key];
            st = null;
        }
        if (!st) {
            st = {
                ownerId: 'enemy-instance:' + (++instanceSequence),
                enemyId: enemyId != null ? String(enemyId) : null,
                part_destroy: createEmptyPartDestroy(),
                maxes: null,
                dead: false,
                // 眩晕累积（37 §9.2，k13）：0-100；stunned=true = 晕 1 回合（下次 AI 行动被跳过）
                stun_value: 0,
                stunned: false,
                // 疼痛（47 §9.6 / k229，敌我通用）：全局 0-100 整数条；上限 = pain_cap_base + pain_cap_per_avg_destroy×平均损毁%（封顶制）
                pain_value: 0,
                pain_no_hit_ticks: 0,
                qi_current: Math.max(0, Math.min(Number((getById(enemyId) || {}).qi_li_max) || 0, Number((getById(enemyId) || {}).qi_li_initial) || 0)),
                last_turn_tick: null,
                weapon_mode: 'weapon',
                weapon_forced_unarmed: false,
                action_cursors: { unarmed: 0, weapon: 0 }
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
        if (st.dead) return { triggered: false, value: st.stun_value || 0 };
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
        return !!(st && (st.stunned || (worldTurnTick != null && st.last_turn_tick === worldTurnTick && st.turn_stunned)));
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
        if (st.dead) return [];
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
            if ((getById(enemyId)||{}).boss) global.CombatEnemyBoss.state(st).damagedTick=actionTick();
            if((getById(enemyId)||{}).thug)global.CombatEnemyThug.state(st,getById(enemyId)).damagedTick=actionTick();
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

    /** Pain effects belong to this individual, never the enemy template. */
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
            if (typeof Buff.hasBuffByBuffId !== 'function' || Buff.hasBuffByBuffId(st.ownerId, bid)) {
                Buff.removeBuffByBuffId(st.ownerId, bid);
            }
        }
        if (targetId) {
            Buff.applyBuff(st.ownerId, targetId, 'pain_system', { tick: getPainBuffTick() });
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
    function drainEnemyKillQueue(mapId) {
        var out = [];
        var key;
        for (key in enemyKillQueue) {
            if (!Object.prototype.hasOwnProperty.call(enemyKillQueue, key)) continue;
            var m = key.lastIndexOf('|i');
            if (m < 0) continue;
            if(mapId != null && key.slice(0,m)!==String(mapId))continue;
            out.push({ key: key, mapId: key.slice(0, m), index: parseInt(key.slice(m + 2), 10) || 0, enemyId: enemyKillQueue[key] });
            delete enemyKillQueue[key];
        }
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
        if (getEnemyInstanceState(mapId, index, d.enemyId).dead) return;
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
                            global.BuffSystem.removeBuffByBuffId(st.ownerId, ENEMY_PAIN_BUFF_IDS[pbi]);
                    }
                }
            } catch (ePb) { /* ignore */ }
        }
        if (st.dead || ctx.collisionDamage) return;
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
    function getEnemyQi(enemyId, mapId, index) {
        var t = getById(enemyId);
        var max = Math.max(0, Number(t && t.qi_li_max) || 0);
        var st = getEnemyInstanceState(mapId, index, enemyId);
        st.qi_current = Math.max(0, Math.min(max, Number(st.qi_current) || 0));
        return { current: st.qi_current, max: max };
    }

    function consumeEnemyQi(enemyId, cost, mapId, index) {
        cost = parseInt(cost, 10) || 0;
        if (cost <= 0) return 0;
        var st = getEnemyInstanceState(mapId, index, enemyId);
        if (st.dead) return 0;
        var spent = Math.min(getEnemyQi(enemyId, mapId, index).current, cost);
        st.qi_current -= spent;
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
     * 仅从实例当前合法的动作中选择；查询不回气，不消耗行动或推进循环。
     * 无合法动作返回 null，调用方取消出招；回气统一在世界 tick 处理。
     */
    function pickEnemyAction(enemyId, mapId, index) {
        var t = getById(enemyId);
        if (!t || !Array.isArray(t.actions) || !t.actions.length) return null;
        var pool = [];
        var i, a;
        for (i = 0; i < t.actions.length; i++) {
            a = t.actions[i] || {};
            if (actionStatus(enemyId, mapId, index, a).ok) pool.push(a);
        }
        if (!pool.length) return null;
        if (t.boss && global.CombatEnemyBoss) return global.CombatEnemyBoss.choose(pool,getEnemyInstanceState(mapId,index,enemyId),global.CombatEnemyBoss.context(enemyId,mapId,index));
        if(t.thug)return global.CombatEnemyThug.choose(pool,getEnemyInstanceState(mapId,index,enemyId),global.CombatEnemyBoss.context(enemyId,mapId,index),t);
        if (t.action_selection === 'cycle') {
            var st = getEnemyInstanceState(mapId, index, enemyId);
            var mode = weaponMode(enemyId, mapId, index);
            var cursor = st.action_cursors[mode] || 0;
            for (var j = 0; j < t.actions.length; j++) {
                var candidate = t.actions[(cursor + j) % t.actions.length];
                if (pool.indexOf(candidate) >= 0) return candidate;
            }
        }
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function copy(value) { return JSON.parse(JSON.stringify(value)); }
    function rememberMap(mapId) {
        var maps = global.GameEngine && global.GameEngine.getMaps && global.GameEngine.getMaps();
        var map = maps && maps[mapId];
        if (map && !map.dungeon && !mapBaselines[mapId]) mapBaselines[mapId] = copy(map.enemies || []);
    }
    function getOwnerId(enemyId, mapId, index) {
        if (mapId == null || index == null || index < 0) return String(enemyId || '');
        return getEnemyInstanceState(mapId, index, enemyId).ownerId;
    }
    function ownerOf(entity) {
        if (!entity || entity.kind !== 'enemy') return 'player';
        return entity.ownerId || getOwnerId(entity.enemyId, entity.mapId, entity.index);
    }
    function clearOwnerBuffs(owner) {
        var bs = global.BuffSystem;
        if (!owner || !bs || !bs.getState || !bs.removeBuffByBuffId) return;
        var list = (bs.getState().instancesByOwner || {})[owner] || [];
        list.slice().forEach(function (buff) { bs.removeBuffByBuffId(owner, buff.buff_id); });
    }
    function actionDisabled(enemyId, mapId, index, action) {
        var bs = global.BuffSystem;
        return !!(bs && bs.hasActionDisabled && bs.hasActionDisabled(getOwnerId(enemyId, mapId, index), action));
    }
    function cannotMove(enemyId, mapId, index) {
        var st = getEnemyInstanceState(mapId, index, enemyId);
        return st.dead || isEnemyStunned(mapId, index) || getEnemyPainTierKey(st) === 'agony'
            || isEnemyPartDestroyed(mapId, index, 'lfoot', enemyId) || isEnemyPartDestroyed(mapId, index, 'rfoot', enemyId)
            || actionDisabled(enemyId, mapId, index, 'move');
    }
    function weaponMode(enemyId, mapId, index) {
        var t = getById(enemyId) || {}, w = t.weapon, st = getEnemyInstanceState(mapId, index, enemyId);
        if (!w) return 'unarmed';
        var hands = w.kind === 'single' ? [w.hand] : ['lhand', 'rhand'];
        var usable = hands.some(function (p) { return (p === 'lhand' || p === 'rhand') && !isEnemyPartDestroyed(mapId, index, p, enemyId); });
        if (!usable) { st.weapon_mode = 'unarmed'; st.weapon_forced_unarmed = true; }
        else if (w.kind === 'single' && st.weapon_forced_unarmed) { st.weapon_mode = 'weapon'; st.weapon_forced_unarmed = false; }
        return st.weapon_mode;
    }
    function actionLimbs(enemyId, mapId, index, action) {
        if (!action) return [];
        var t = getById(enemyId) || {}, w = t.weapon;
        if(action.required_limbs!=null && !Array.isArray(action.required_limbs))return [];
        if(action.mode==='weapon' && (!w || ['single','two_handed','polearm'].indexOf(w.kind)<0))return [];
        var limbs = action.mode === 'weapon' && w
            ? (w.kind === 'single' ? [w.hand] : ['lhand', 'rhand'].filter(function (p) { return !isEnemyPartDestroyed(mapId,index,p,enemyId); }))
            : [normalizeDestroyKey(action.limb)];
        return limbs.concat((action.required_limbs || []).map(normalizeDestroyKey)).filter(function(p,i,a){return a.indexOf(p)===i;});
    }
    function actionStatus(enemyId, mapId, index, action) {
        var t = getById(enemyId), st = getEnemyInstanceState(mapId, index, enemyId);
        function no(reason) { return { ok: false, reason: reason, damageMultiplier: 0 }; }
        if (!t || t.can_attack === false || st.dead) return no(st.dead ? 'dead' : 'cannot_attack');
        if (isEnemyStunned(mapId,index) || actionDisabled(enemyId,mapId,index,'attack')) return no('stunned_or_disabled');
        if (!action || !Array.isArray(t.actions) || t.actions.indexOf(action) < 0) return no('no_action');
        var mode = weaponMode(enemyId,mapId,index);
        if ((action.mode || 'unarmed') !== mode) return no('weapon_unavailable');
        var limbs = actionLimbs(enemyId,mapId,index,action);
        if (!limbs.length || limbs.some(function(p){return ['lhand','rhand','lfoot','rfoot'].indexOf(p)<0 || isEnemyPartDestroyed(mapId,index,p,enemyId);})) return no('limb_destroyed');
        if (action.requires_movement && cannotMove(enemyId,mapId,index)) return no('movement_disabled');
        if (Math.max(0, Number(action.qi_cost) || 0) > getEnemyQi(enemyId,mapId,index).current) return no('insufficient_qi');
        if(t.boss && global.CombatEnemyBoss){var reason=global.CombatEnemyBoss.status(st,action,global.CombatEnemyBoss.context(enemyId,mapId,index));if(reason)return no(reason);}
        if(t.thug){var why=global.CombatEnemyThug.status(st,action,global.CombatEnemyBoss.context(enemyId,mapId,index),t);if(why)return no(why);}
        var w = t.weapon, woundedHand = isEnemyPartDestroyed(mapId,index,'lhand',enemyId) || isEnemyPartDestroyed(mapId,index,'rhand',enemyId);
        return {ok:true,reason:null,damageMultiplier:mode==='weapon' && w && (w.kind==='two_handed'||w.kind==='polearm') && woundedHand ? .5 : 1};
    }
    function commitAction(enemyId,mapId,index,action) {
        var t = getById(enemyId), st = getEnemyInstanceState(mapId,index,enemyId);
        if (t && t.action_selection === 'cycle') st.action_cursors[action.mode || 'unarmed'] = (t.actions.indexOf(action)+1) % t.actions.length;
    }
    function planAction(enemyId,mapId,index) {
        prepareBossOpportunity(enemyId,mapId,index,true,false);
        var action = pickEnemyAction(enemyId,mapId,index);
        return {action:action,occupiedLimbs:actionLimbs(enemyId,mapId,index,action)};
    }
    function parryContext(defender, hitPart) {
        var id=defender.enemyId, mapId=defender.mapId, index=defender.index;
        var st=getEnemyInstanceState(mapId,index,id);
        function skip(reason){return {skip:true,reason:reason,guardLimb:null};}
        if ((getById(id)||{}).boss && global.CombatEnemyBoss.state(st).meditationTick===actionTick())return skip('meditating');
        if((getById(id)||{}).thug && global.CombatEnemyThug.state(st,getById(id)).meditationTick===actionTick())return skip('meditating');
        if(st.dead || isEnemyStunned(mapId,index) || actionDisabled(id,mapId,index,'parry')) return skip('incapacitated');
        var forbidden=defender.occupiedLimbs || [], p=normalizeDestroyKey(hitPart), limbs=['lhand','rhand','lfoot','rfoot'];
        if(PART_ORDER.indexOf(p)<0) return skip('unknown_hit_part');
        var struckLimb=limbs.indexOf(p)>=0;
        if(struckLimb && isEnemyPartDestroyed(mapId,index,p,id)) return skip('struck_limb_destroyed');
        var candidates=limbs.filter(function(l){return forbidden.indexOf(l)<0 && !isEnemyPartDestroyed(mapId,index,l,id);});
        if(struckLimb && forbidden.indexOf(p)<0) candidates=[p];
        if(!candidates.length) return skip('no_parry_candidate');
        return {skip:false,reason:null,guardLimb:candidates[Math.floor(Math.random()*candidates.length)]};
    }
    function tickEnemy(mapId,index,enemyId,tick) {
        var st=getEnemyInstanceState(mapId,index,enemyId), t=getById(enemyId)||{};
        tick=Number(tick);
        if (!isFinite(tick)) tick=getPainBuffTick();
        var fresh=st.last_turn_tick !== tick;
        if(fresh) {
            st.last_turn_tick=tick;
            st.turn_stunned=!!st.stunned;
            st.stunned=false;
            if(!st.dead) {
                st.stun_value=Math.max(0,(st.stun_value||0)-1);
                decayEnemyPain(st);
                var qi=getEnemyQi(enemyId,mapId,index);
                st.qi_current=Math.min(qi.max,qi.current+Math.max(0,Number(t.qi_li_regen_per_turn)||0));
            }
        }
        return {skip:st.dead||st.turn_stunned,cannotMove:cannotMove(enemyId,mapId,index),fresh:fresh};
    }
    function healInjury(mapId,index,enemyId,amount) {
        var st=getEnemyInstanceState(mapId,index,enemyId), before=Math.max(0,Math.floor(Number(amount)||0)), left=before, restored=[];
        if(st.dead) return 0;
        PART_ORDER.forEach(function(p){
            var was=st.part_destroy[p]>=st.maxes[p], heal=Math.min(left,st.part_destroy[p]);
            st.part_destroy[p]-=heal;left-=heal;
            if(was && st.part_destroy[p]<st.maxes[p]) restored.push(p);
        });
        if(restored.length) {
            var key=getEnemyInstanceKey(mapId,index), old=enemyLimbRecoveryQueue[key];
            enemyLimbRecoveryQueue[key]={mapId:mapId,index:index,enemyId:enemyId,parts:(old?old.parts:[]).concat(restored)};
        }
        syncEnemyPainBuff(st);
        weaponMode(enemyId,mapId,index);
        return before-left;
    }
    function restoreInstance(mapId,index,enemyId,data) {
        var key=getEnemyInstanceKey(mapId,index);
        delete enemyInstanceStates[key];
        var st=getEnemyInstanceState(mapId,index,enemyId);
        if(!data || typeof data!=='object') return;
        if(typeof data.ownerId==='string' && /^enemy-instance:\d+$/.test(data.ownerId)) {
            st.ownerId=data.ownerId;instanceSequence=Math.max(instanceSequence,Number(data.ownerId.split(':')[1]));
        }
        PART_ORDER.forEach(function(p){
            var max=Number(data.maxes && data.maxes[p]);
            if(isFinite(max)&&max>0) st.maxes[p]=Math.max(1,Math.floor(max));
            st.part_destroy[p]=Math.max(0,Math.min(st.maxes[p],Math.floor(Number(data.part_destroy && data.part_destroy[p])||0)));
        });
        st.dead=!!data.dead || (!(getById(enemyId)||{}).limbs_invulnerable && isFatallyDestroyed(st));
        ['stun_value','pain_value'].forEach(function(p){st[p]=Math.max(0,Math.min(100,Number(data[p])||0));});
        st.stunned=!!data.stunned;st.turn_stunned=!!data.turn_stunned;
        st.pain_no_hit_ticks=Math.max(0,Number(data.pain_no_hit_ticks)||0);
        st.qi_current=Math.max(0,Math.min(Number((getById(enemyId)||{}).qi_li_max)||0,Number(data.qi_current)||0));
        st.last_turn_tick=Number.isFinite(data.last_turn_tick)?data.last_turn_tick:null;
        if ((getById(enemyId)||{}).boss && global.CombatEnemyBoss) global.CombatEnemyBoss.restore(st,data.boss);
        if((getById(enemyId)||{}).thug)global.CombatEnemyThug.restore(st,data.thug,getById(enemyId));
        if(data.shield_remaining!=null) st.shield_remaining=Math.max(0,Number(data.shield_remaining)||0);
        st.weapon_mode=data.weapon_mode==='unarmed'?'unarmed':'weapon';st.weapon_forced_unarmed=!!data.weapon_forced_unarmed;
        ['unarmed','weapon'].forEach(function(p){st.action_cursors[p]=Math.max(0,Math.floor(Number(data.action_cursors&&data.action_cursors[p])||0));});
        if(st.dead) enemyKillQueue[key]=enemyId;
    }
    function getPersistentState() {
        var maps=global.GameEngine && global.GameEngine.getMaps && global.GameEngine.getMaps(), savedMaps={};
        Object.keys(mapBaselines).forEach(function(id){if(maps && maps[id] && !maps[id].dungeon)savedMaps[id]=copy(maps[id].enemies||[]);});
        return copy({version:1,instanceSequence:instanceSequence,instances:enemyInstanceStates,ai:enemyAiState,maps:savedMaps,facing:facingByKey});
    }
    function setPersistentState(data) {
        var maps=global.GameEngine && global.GameEngine.getMaps && global.GameEngine.getMaps();
        Object.keys(mapBaselines).forEach(function(id){if(maps&&maps[id]&&!maps[id].dungeon)maps[id].enemies=copy(mapBaselines[id]);});
        enemyInstanceStates={};enemyAiState={};enemyKillQueue={};enemyLimbLossQueue={};enemyLimbRecoveryQueue={};worldTurnTick=null;
        if(global.CombatWorld && global.CombatWorld.resetTransientState)global.CombatWorld.resetTransientState();
        instanceSequence=Math.max(0,Number(data&&data.instanceSequence)||0);facingByKey=copy(data&&data.facing||{});
        if(!data)return;
        Object.keys(data.maps||{}).forEach(function(id){
            if(maps&&maps[id]&&!maps[id].dungeon&&Array.isArray(data.maps[id])){rememberMap(id);maps[id].enemies=copy(data.maps[id]);}
        });
        Object.keys(data.instances||{}).forEach(function(key){
            var split=key.lastIndexOf('|i');if(split<0)return;
            var v=data.instances[key];if(!v || !v.enemyId)return;
            restoreInstance(key.slice(0,split),Number(key.slice(split+2)),v.enemyId,v);
        });
        enemyAiState=copy(data.ai||{});
    }
    function validateTemplates() {
        var errors=[];
        Object.keys(table.enemies).forEach(function(id){
            var t=getById(id);
            if(t.can_attack===false)return;
            if(!Array.isArray(t.actions)||!t.actions.length){errors.push(id+': missing actions');return;}
            PART_ORDER.forEach(function(p){var max=Number(t.body_part_destroy_max&&t.body_part_destroy_max[p]);if(!Number.isInteger(max)||max<=0)errors.push(id+': invalid part maximum '+p);});
            if(t.weapon && (['single','two_handed','polearm'].indexOf(t.weapon.kind)<0 || t.weapon.kind==='single' && ['lhand','rhand'].indexOf(t.weapon.hand)<0))errors.push(id+': unsupported weapon dependency');
            t.actions.forEach(function(a){
                if(!a || typeof a!=='object'){errors.push(id+': invalid action');return;}
                if(!a.id || (a.mode!=='weapon' && ['lhand','rhand','lfoot','rfoot'].indexOf(normalizeDestroyKey(a.limb))<0))errors.push(id+': invalid action limb');
                if(a.mode && a.mode!=='weapon' && a.mode!=='unarmed' || a.mode==='weapon' && !t.weapon)errors.push(id+': invalid action mode');
                if(a.required_limbs!=null && (!Array.isArray(a.required_limbs)||a.required_limbs.some(function(p){return ['lhand','rhand','lfoot','rfoot'].indexOf(normalizeDestroyKey(p))<0;})))errors.push(id+': invalid required limb');
                if(!Number.isFinite(a.power_min)||a.power_min<0||!Number.isFinite(a.power_max)||a.power_max<a.power_min)errors.push(id+': invalid action power');
            });
        });
        return errors;
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
        if(map.dungeon && global.DungeonRuntime?.provoke)global.DungeonRuntime.provoke(index);
        var key = enemyAiKey(map.map_id, index);
        var st = enemyAiState[key] || (enemyAiState[key] = {
            lastMoveTick: 0, aggro: false, homeX: rec.x | 0, homeY: rec.y | 0
        });
        st.aggro = true;
        st.protectThroughTick = Math.max(parseInt(st.protectThroughTick, 10) || 0, parseInt(protectThroughTick, 10) || 0);
        return true;
    }

    function isEnemyAggro(mapId, index) {
        if (global.DungeonRuntime && global.DungeonRuntime.active()) return global.DungeonRuntime.aggro(index);
        var st = enemyAiState[enemyAiKey(mapId, index)];
        return !!(st && st.aggro);
    }

    /** enemies[] 删除一项后同步按下标存放的 AI 状态，避免后续实例继承错误仇恨。 */
    function removeEnemyAiStateAt(mapId, removedIndex) {
        var prefix = String(mapId || '') + '|i';
        var removed=enemyInstanceStates[prefix+removedIndex];
        if(removed)clearOwnerBuffs(removed.ownerId);
        [enemyInstanceStates,enemyKillQueue,enemyLimbLossQueue,enemyLimbRecoveryQueue].forEach(function(state){
            var shifted={};Object.keys(state).forEach(function(k){
                if(k.indexOf(prefix)!==0)return;
                var i=Number(k.slice(prefix.length)),v=state[k];delete state[k];
                if(i!==removedIndex) { if(v&&typeof v==='object'&&v.index!=null)v.index=i>removedIndex?i-1:i;shifted[prefix+(i>removedIndex?i-1:i)]=v; }
            });Object.assign(state,shifted);
        });
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
        if (o && o.map && o.map.dungeon && global.DungeonRuntime) return global.DungeonRuntime.updateAI(o) || {moves:[],attacks:[]};
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
            var turn=tickEnemy(o.map.map_id,i,eid,tick);
            if(turn.skip || !turn.fresh)continue;
            var instSt = getEnemyInstanceState(o.map.map_id, i, eid);
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
            if (!turn.cannotMove && !legsDisabled && !painAgonyNow && dist > 1 && tick - st.lastMoveTick >= aiMoveInterval(tpl)) {
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

    function actionTick(){return worldTurnTick!=null?worldTurnTick:getPainBuffTick()+1;}
    function prepareBossOpportunity(id,mapId,index,combat,home,canAttack){
        if((getById(id)||{}).thug)global.CombatEnemyThug.prepareOpportunity(getEnemyInstanceState(mapId,index,id),global.CombatEnemyBoss.context(id,mapId,index),getById(id),combat,home);
        if((getById(id)||{}).boss && global.CombatEnemyBoss)global.CombatEnemyBoss.prepareOpportunity(getEnemyInstanceState(mapId,index,id),global.CombatEnemyBoss.context(id,mapId,index),combat,home,canAttack);
    }
    global.CombatEnemies = {
        actionTick:actionTick,
        prepareBossOpportunity:prepareBossOpportunity,
        bossInfo:function(id,mapId,index){return (getById(id)||{}).boss?copy(global.CombatEnemyBoss.state(getEnemyInstanceState(mapId,index,id))):null;},
        // Render-only snapshot: never creates instances, heals or advances boss decisions.
        breathVisualStates:function(mapId){return Object.entries(enemyInstanceStates).filter(function(pair){return pair[0].startsWith(mapId+'|i')&&pair[1].boss;}).map(function(pair){var st=pair[1],b=st.boss;return {key:'enemy:'+Number(pair[0].slice((mapId+'|i').length)),index:Number(pair[0].slice((mapId+'|i').length)),enemyId:st.enemyId,ownerId:st.ownerId,dead:!!st.dead,remaining:b.burstRemaining,warning:b.warningTick!=null&&b.charge>=200};});},
        thugInfo:function(id,mapId,index){return (getById(id)||{}).thug?copy(global.CombatEnemyThug.state(getEnemyInstanceState(mapId,index,id),getById(id))):null;},
        tryThugDash:function(id,mapId,index,s,e){return global.CombatEnemyThug.dash(getEnemyInstanceState(mapId,index,id),global.CombatEnemyBoss.context(id,mapId,index),getById(id),s,e);},
        quoteBossAction:function(id,mapId,index,a){if(getById(id)?.thug)return global.CombatEnemyThug.quote(getEnemyInstanceState(mapId,index,id),a,global.CombatEnemyBoss.context(id,mapId,index),getById(id));return global.CombatEnemyBoss.quote(getEnemyInstanceState(mapId,index,id),a,global.CombatEnemyBoss.context(id,mapId,index));},
        commitBossAction:function(q){var st=enemyInstanceStates[getEnemyInstanceKey(q.mapId,q.index)];if(st&&st.ownerId===q.ownerId){if(q.policy==='thug')global.CombatEnemyThug.commit(st,q,getById(st.enemyId));else global.CombatEnemyBoss.commit(st,q);}},
        speedBuffBase:function(owner,base){var st=Object.values(enemyInstanceStates).find(function(s){return s.ownerId===owner;});return st&&((getById(st.enemyId)||{}).boss||(getById(st.enemyId)||{}).thug)?1:base;},
        dungeonTurnStatus:tickEnemy,
        getDungeonState:function(mapId,index,enemyId){return JSON.parse(JSON.stringify(getEnemyInstanceState(mapId,index,enemyId)));},
        restoreDungeonState:restoreInstance,
        healDungeonInjury:healInjury,
        getState:getPersistentState,
        setState:setPersistentState,
        getOwnerId:getOwnerId,
        ownerOf:ownerOf,
        actionStatus:actionStatus,
        planAction:planAction,
        actionLimbs:actionLimbs,
        commitAction:commitAction,
        parryContext:parryContext,
        cannotMove:cannotMove,
        validateTemplates:validateTemplates,
        beginWorldTurn:function(tick){worldTurnTick=Number(tick);},
        endWorldTurn:function(){var tick=worldTurnTick;Object.keys(enemyInstanceStates).forEach(function(k){var st=enemyInstanceStates[k];if((getById(st.enemyId)||{}).boss && tick!=null)global.CombatEnemyBoss.endTick(st,tick);if((getById(st.enemyId)||{}).thug&&tick!=null)global.CombatEnemyThug.endTick(st,tick,getById(st.enemyId));});worldTurnTick=null;},
        drainEnemyLimbRecoveryQueue:function(){var list=Object.keys(enemyLimbRecoveryQueue).map(function(k){return enemyLimbRecoveryQueue[k];});enemyLimbRecoveryQueue={};return list;},
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
