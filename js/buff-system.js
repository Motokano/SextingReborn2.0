/**
 * Buff 系统运行时（统一触发入口）
 * - 支持对任意“已注册事件”触发 Buff 流水线
 * - 执行顺序：过滤 -> priority -> 消耗判定 -> 先扣层 -> 再应用效果 -> 层数<=0移除
 * - 目前默认宿主使用 "player"
 */
(function (global) {
    'use strict';

    var PLAYER_OWNER_ID = 'player';
    var loaded = false;
    var config = { version: 1, buffs: [] };
    var registry = { event_kinds: [], event_names: [], tags: [] };
    var indexByEvent = {}; // event_kind:event_name -> [buffTemplate]
    var instancesByOwner = {}; // ownerId -> [instance]
    var templateById = {}; // buff_id -> normalized template
    var eventSeq = 0;
    var attrSeq = 0;
    var registeredSet = { kinds: {}, names: {}, tags: {} };
    var timeSnapshot = null;
    var lastAttrSnapshot = null;
    var ready = false;
    var pendingRestore = null; // { instancesByOwner, tick }
    var pendingEvents = [];
    var pendingReady = { registry: false, buffs: false };
    var isEmittingBuffState = false;
    var lastEnergyLethalTick = -1;

    function hasDebugEnabled() {
        try {
            return !!(global && global.BuffDebug && global.BuffDebug.buff_debug_enabled);
        } catch (e) {
            return false;
        }
    }

    function debugLog(msg) {
        if (!hasDebugEnabled()) return;
        if (global && global.GameLog && typeof global.GameLog.log === 'function') {
            global.GameLog.log('[BUFF] ' + msg, 'system');
        } else if (typeof console !== 'undefined' && console.log) {
            console.log('[BUFF]', msg);
        }
    }

    function notifyBuffHudRefresh() {
        if (global.SceneCtx && typeof global.SceneCtx.updateStatusPanel === 'function') {
            try {
                global.SceneCtx.updateStatusPanel();
            } catch (eHud) { /* SceneApp 未就绪时忽略 */ }
        }
    }

    function safeNum(v, def) {
        return (typeof v === 'number' && isFinite(v)) ? v : def;
    }

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    /** 策划用：同一 Buff 上可挂多键字符串标签（如食物大类 + 具体物品），供复合条件判断；不参与触发过滤。 */
    function normalizeJudgmentTags(raw) {
        if (!isPlainObject(raw)) return {};
        var out = {};
        var keys = Object.keys(raw);
        for (var i = 0; i < keys.length; i++) {
            var k = String(keys[i] || '').trim();
            if (!k) continue;
            var v = raw[keys[i]];
            if (v == null) continue;
            var s = String(v).trim();
            if (!s) continue;
            out[k] = s;
        }
        return out;
    }

    function judgmentTagsMatch(templateTags, requiredTags) {
        var reqKeys = Object.keys(requiredTags);
        if (!reqKeys.length) return true;
        for (var i = 0; i < reqKeys.length; i++) {
            var rk = reqKeys[i];
            if (templateTags[rk] !== requiredTags[rk]) return false;
        }
        return true;
    }

    function ownerHasBuffMatchingJudgmentTags(ownerId, requiredRaw) {
        var required = normalizeJudgmentTags(requiredRaw);
        if (!Object.keys(required).length) return true;
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        for (var i = 0; i < arr.length; i++) {
            var inst = arr[i];
            if (!inst || (inst.stacks || 0) <= 0 || !inst.template) continue;
            var tplTags = inst.template.judgment_tags || {};
            if (judgmentTagsMatch(tplTags, required)) return true;
        }
        return false;
    }

    function arrayOrEmpty(v) {
        return Array.isArray(v) ? v : [];
    }

    function makeEventId(prefix) {
        eventSeq += 1;
        return String(prefix || 'evt') + '_' + String(Date.now()) + '_' + String(eventSeq);
    }

    function emitBuffStateChanged(ownerId, reason, payload) {
        if (isEmittingBuffState) return;
        isEmittingBuffState = true;
        try {
            triggerBuffPipeline({
                event_kind: 'buff',
                event_name: 'buff_state_changed',
                tags: ['buff', 'player', 'state'],
                actor_id: ownerId || PLAYER_OWNER_ID,
                owner_id: ownerId || PLAYER_OWNER_ID,
                payload: {
                    reason: reason || 'changed',
                    detail: payload || null
                }
            });
        } finally {
            isEmittingBuffState = false;
        }
    }

    function getTickNow() {
        if (global && global.GameTime && typeof global.GameTime.getState === 'function') {
            var st = global.GameTime.getState();
            if (st && typeof st.totalTicks === 'number') return st.totalTicks;
        }
        return 0;
    }

    function normalizeTemplate(t) {
        t = t && typeof t === 'object' ? t : {};
        return {
            buff_id: t.buff_id || '',
            name: t.name || '',
            desc: t.desc || '',
            durationTicks: Math.max(0, parseInt(t.durationTicks, 10) || 0),
            maxStacks: Math.max(1, parseInt(t.maxStacks, 10) || 1),
            stacksAddOnApply: Math.max(0, parseInt(t.stacksAddOnApply, 10) || 0),
            priority: parseInt(t.priority, 10) || 100,
            listenerSide: t.listenerSide || 'self',
            consumeMode: t.consumeMode || 'always',
            consumeLayersFixed: Math.max(0, parseInt(t.consumeLayersFixed, 10) || 0),
            applyMode: t.applyMode || 'tie_to_consume',
            triggerEventKind: arrayOrEmpty(t.triggerEventKind),
            triggerEventName: arrayOrEmpty(t.triggerEventName),
            triggerTags: arrayOrEmpty(t.triggerTags),
            effects: arrayOrEmpty(t.effects),
            /** 实例因到期或层数耗尽被移除时执行（不经事件管线）；目前实现 survival_delta */
            expire_effects: arrayOrEmpty(t.expire_effects),
            food_digest: !!t.food_digest,
            judgment_tags: normalizeJudgmentTags(t.judgment_tags),
            /** 见 design/18：beneficial 可被「破相」等驱散；缺省不可选 */
            dispel_pool: t.dispel_pool === 'beneficial' ? 'beneficial' : '',
            dispel_priority: (function () {
                var dp = parseInt(t.dispel_priority, 10);
                return isFinite(dp) ? dp : 1000;
            })()
        };
    }

    function rebuildIndexes() {
        indexByEvent = {};
        templateById = {};
        for (var i = 0; i < config.buffs.length; i++) {
            var t = normalizeTemplate(config.buffs[i]);
            if (!t.buff_id) continue;
            templateById[t.buff_id] = t;
            var kinds = t.triggerEventKind.length ? t.triggerEventKind : ['*'];
            var names = t.triggerEventName.length ? t.triggerEventName : ['*'];
            for (var k = 0; k < kinds.length; k++) {
                for (var n = 0; n < names.length; n++) {
                    var key = kinds[k] + ':' + names[n];
                    if (!indexByEvent[key]) indexByEvent[key] = [];
                    indexByEvent[key].push(t);
                }
            }
        }
    }

    function rebuildRegistrySets() {
        registeredSet.kinds = {};
        registeredSet.names = {};
        registeredSet.tags = {};
        var i;
        for (i = 0; i < registry.event_kinds.length; i++) registeredSet.kinds[registry.event_kinds[i]] = true;
        for (i = 0; i < registry.event_names.length; i++) registeredSet.names[registry.event_names[i]] = true;
        for (i = 0; i < registry.tags.length; i++) registeredSet.tags[registry.tags[i]] = true;
    }

    function fetchJson(path, onOk, onFail) {
        if (typeof fetch !== 'function') {
            if (onFail) onFail(new Error('fetch not available'));
            return;
        }
        fetch(path).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + path);
            return r.json();
        }).then(onOk).catch(function (e) {
            if (onFail) onFail(e);
        });
    }

    function ensureOwner(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        if (!instancesByOwner[oid]) instancesByOwner[oid] = [];
        return instancesByOwner[oid];
    }

    function getBuffTemplate(buffId) {
        var id = String(buffId || '');
        var t = templateById[id];
        return t || null;
    }

    /** 某 owner 上指定 buff_id 的实例层数之和（用于试探层数等） */
    function getBuffStacksSum(ownerId, buffId) {
        if (!buffId) return 0;
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        var sum = 0;
        var i;
        for (i = 0; i < arr.length; i++) {
            var inst = arr[i];
            if (inst && inst.buff_id === buffId) sum += Math.max(0, parseInt(inst.stacks, 10) || 0);
        }
        return sum;
    }

    function getParryChanceDeltaPercent(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        var sum = 0;
        var i, j, inst, effects, e, p, d;
        for (i = 0; i < arr.length; i++) {
            inst = arr[i];
            if (!inst || !inst.template || inst.stacks <= 0) continue;
            effects = arrayOrEmpty(inst.template.effects);
            for (j = 0; j < effects.length; j++) {
                e = effects[j] || {};
                if (e.type !== 'parry_chance_delta_percent') continue;
                p = e.params || {};
                d = safeNum(p.delta_per_stack, 0);
                sum += d * safeNum(inst.stacks, 0);
            }
        }
        return sum;
    }

    function removeBuffByBuffId(ownerId, buffId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var bid = String(buffId || '');
        if (!bid) return 0;
        var arr = instancesByOwner[oid];
        if (!arr || !arr.length) return 0;
        var removed = 0;
        for (var j = arr.length - 1; j >= 0; j--) {
            if (arr[j] && arr[j].buff_id === bid) {
                arr.splice(j, 1);
                removed += 1;
            }
        }
        if (removed) {
            recalcDerived();
            notifyBuffHudRefresh();
            emitBuffStateChanged(oid, 'remove_by_id', { buff_id: bid, removed: removed });
        }
        return removed;
    }

    function hasBuffByBuffId(ownerId, buffId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var bid = String(buffId || '');
        if (!bid) return false;
        var arr = instancesByOwner[oid] || [];
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].buff_id === bid && (arr[i].stacks || 0) > 0) return true;
        }
        return false;
    }

    function hasActiveSatietyDigestBuff(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        for (var i = 0; i < arr.length; i++) {
            var inst = arr[i];
            if (!inst || !inst.template || !inst.template.food_digest || (inst.stacks || 0) <= 0) continue;
            var effects = arrayOrEmpty(inst.template.effects);
            for (var j = 0; j < effects.length; j++) {
                var e = effects[j] || {};
                if (e.type !== 'survival_delta') continue;
                var p = e.params || {};
                if (safeNum(p.satiety, 0) > 0) return true;
            }
        }
        return false;
    }

    function hasMovementDisabled(ownerId) {
        // 兼容旧 effect：disable_movement；并兼容新 effect：disable_actions(move)
        return hasActionDisabled(ownerId, 'move');
    }

    function extractDisabledActionsFromEffect(effect) {
        var out = {};
        var e = effect || {};
        var p = e.params || {};
        if (e.type === 'disable_movement') {
            out.move = true;
            return out;
        }
        if (e.type !== 'disable_actions') return out;
        var raw = [];
        if (Array.isArray(p.action_types)) raw = p.action_types;
        else if (Array.isArray(p.actions)) raw = p.actions;
        else if (typeof p.action_type === 'string') raw = [p.action_type];
        for (var i = 0; i < raw.length; i++) {
            var key = String(raw[i] || '').trim().toLowerCase();
            if (!key) continue;
            if (key === 'movement') key = 'move';
            out[key] = true;
        }
        return out;
    }

    function getDisabledActionMap(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        var out = {};
        for (var i = 0; i < arr.length; i++) {
            var inst = arr[i];
            if (!inst || !inst.template || (inst.stacks || 0) <= 0) continue;
            var effects = arrayOrEmpty(inst.template.effects);
            for (var j = 0; j < effects.length; j++) {
                var m = extractDisabledActionsFromEffect(effects[j]);
                var ks = Object.keys(m);
                for (var k = 0; k < ks.length; k++) out[ks[k]] = true;
            }
        }
        return out;
    }

    function getDisabledActions(ownerId) {
        return Object.keys(getDisabledActionMap(ownerId));
    }

    function hasActionDisabled(ownerId, actionType) {
        var map = getDisabledActionMap(ownerId);
        if (actionType == null || actionType === '') return Object.keys(map).length > 0;
        var key = String(actionType).trim().toLowerCase();
        if (key === 'movement') key = 'move';
        return !!map[key];
    }

    function getProductionSuccessRateDeltaPercent(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        var sum = 0;
        var i, j, inst, effects, e, p, d, stacks;
        for (i = 0; i < arr.length; i++) {
            inst = arr[i];
            if (!inst || !inst.template || (inst.stacks || 0) <= 0) continue;
            effects = arrayOrEmpty(inst.template.effects);
            stacks = Math.max(1, parseInt(inst.stacks, 10) || 1);
            for (j = 0; j < effects.length; j++) {
                e = effects[j] || {};
                if (e.type !== 'production_success_rate_delta_percent') continue;
                p = e.params || {};
                d = safeNum(p.delta_percent, 0);
                if (!isFinite(d) || d === 0) continue;
                sum += d * stacks;
            }
        }
        return sum;
    }

    function getBattlePotentialGainMultiplier(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        var mul = 1;
        var i, j, inst, effects, e, p, m;
        for (i = 0; i < arr.length; i++) {
            inst = arr[i];
            if (!inst || !inst.template || (inst.stacks || 0) <= 0) continue;
            effects = arrayOrEmpty(inst.template.effects);
            for (j = 0; j < effects.length; j++) {
                e = effects[j] || {};
                if (e.type !== 'battle_potential_gain_multiplier') continue;
                p = e.params || {};
                m = safeNum(p.multiplier, 1);
                if (!isFinite(m) || m <= 0) continue;
                mul *= m;
            }
        }
        return mul;
    }

    function getBattleCombatExperienceGainMultiplier(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        var mul = 1;
        var i, j, inst, effects, e, p, m;
        for (i = 0; i < arr.length; i++) {
            inst = arr[i];
            if (!inst || !inst.template || (inst.stacks || 0) <= 0) continue;
            effects = arrayOrEmpty(inst.template.effects);
            for (j = 0; j < effects.length; j++) {
                e = effects[j] || {};
                if (e.type !== 'battle_combat_experience_gain_multiplier') continue;
                p = e.params || {};
                m = safeNum(p.multiplier, 1);
                if (!isFinite(m) || m <= 0) continue;
                mul *= m;
            }
        }
        return mul;
    }

    function getBattleMoveSpeedMultiplier(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        var mul = 1;
        var i, j, inst, effects, e, p, m;
        for (i = 0; i < arr.length; i++) {
            inst = arr[i];
            if (!inst || !inst.template || (inst.stacks || 0) <= 0) continue;
            effects = arrayOrEmpty(inst.template.effects);
            for (j = 0; j < effects.length; j++) {
                e = effects[j] || {};
                if (e.type !== 'battle_move_speed_multiplier') continue;
                p = e.params || {};
                m = safeNum(p.multiplier, 1);
                if (!isFinite(m) || m <= 0) continue;
                mul *= m;
            }
        }
        return mul;
    }

    function getBattleMoveSpeedDeltaPercent(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        var sum = 0;
        var i, j, inst, effects, e, p, d, stacks;
        for (i = 0; i < arr.length; i++) {
            inst = arr[i];
            if (!inst || !inst.template || (inst.stacks || 0) <= 0) continue;
            effects = arrayOrEmpty(inst.template.effects);
            stacks = Math.max(1, parseInt(inst.stacks, 10) || 1);
            for (j = 0; j < effects.length; j++) {
                e = effects[j] || {};
                if (e.type !== 'battle_move_speed_delta_percent') continue;
                p = e.params || {};
                d = safeNum(p.delta_percent, 0);
                if (!isFinite(d) || d === 0) continue;
                sum += d * stacks;
            }
        }
        return sum;
    }

    function getBattleFinalDamageTakenMultiplier(ownerId) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var arr = instancesByOwner[oid] || [];
        var mul = 1;
        var i, j, inst, effects, e, p, m;
        for (i = 0; i < arr.length; i++) {
            inst = arr[i];
            if (!inst || !inst.template || (inst.stacks || 0) <= 0) continue;
            effects = arrayOrEmpty(inst.template.effects);
            for (j = 0; j < effects.length; j++) {
                e = effects[j] || {};
                if (e.type !== 'battle_final_damage_taken_multiplier') continue;
                p = e.params || {};
                m = safeNum(p.multiplier, 1);
                if (!isFinite(m) || m <= 0) continue;
                mul *= m;
            }
        }
        return mul;
    }

    function registerRuntimeBuffTemplate(template) {
        var t = normalizeTemplate(template || {});
        if (!t.buff_id) return false;
        var replaced = false;
        for (var i = 0; i < config.buffs.length; i++) {
            if (config.buffs[i] && config.buffs[i].buff_id === t.buff_id) {
                config.buffs[i] = t;
                replaced = true;
                break;
            }
        }
        if (!replaced) config.buffs.push(t);
        templateById[t.buff_id] = t;
        rebuildIndexes();
        return true;
    }

    function applyBuff(ownerId, buffId, sourceId, eventContext) {
        var oid = ownerId || PLAYER_OWNER_ID;
        var templates = config.buffs || [];
        var tpl = null;
        for (var i = 0; i < templates.length; i++) {
            if (templates[i] && templates[i].buff_id === buffId) {
                tpl = normalizeTemplate(templates[i]);
                break;
            }
        }
        if (!tpl) return false;
        var arr = ensureOwner(oid);
        var existing = null;
        for (var j = 0; j < arr.length; j++) {
            if (arr[j].buff_id === buffId) {
                existing = arr[j];
                break;
            }
        }
        var nowTick = eventContext && typeof eventContext.tick === 'number' ? eventContext.tick : getTickNow();
        if (existing) {
            var currentStacks = Math.max(0, parseInt(existing.stacks, 10) || 0);
            // 兼容旧存档/异常流程里的 0 层实例：重上时至少恢复到 1 层，避免 HUD 永久不显示。
            if (currentStacks <= 0) currentStacks = 1;
            existing.stacks = Math.min(tpl.maxStacks, Math.max(1, currentStacks + tpl.stacksAddOnApply));
            existing.expires_at_tick = nowTick + tpl.durationTicks;
            existing.template = tpl;
            debugLog('reapply ' + buffId + ' stacks=' + existing.stacks);
        } else {
            arr.push({
                uid: buffId + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
                buff_id: tpl.buff_id,
                owner_id: oid,
                source_id: sourceId || null,
                started_tick: nowTick,
                expires_at_tick: nowTick + tpl.durationTicks,
                stacks: Math.min(tpl.maxStacks, tpl.stacksAddOnApply || 1),
                template: tpl
            });
            debugLog('apply ' + buffId + ' owner=' + oid);
        }
        recalcDerived();
        notifyBuffHudRefresh();
        emitBuffStateChanged(oid, existing ? 'reapply' : 'apply', { buff_id: buffId });
        return true;
    }

    function removeExpiredByTick(tick) {
        var changed = false;
        var owners = Object.keys(instancesByOwner);
        for (var i = 0; i < owners.length; i++) {
            var arr = instancesByOwner[owners[i]];
            for (var j = arr.length - 1; j >= 0; j--) {
                var inst = arr[j];
                // 过期语义采用右开区间：[started_tick, expires_at_tick)
                // 当 tick 恰好等于 expires_at_tick 时，仍允许该 tick 的事件链读取到实例；
                // 仅当 tick 超过 expires_at_tick 才真正移除，避免 1tick 状态 Buff 被“同轮提前清空”。
                if (inst.expires_at_tick < tick) {
                    applyExpireEffects(inst, tick);
                    arr.splice(j, 1);
                    changed = true;
                }
            }
        }
        return changed;
    }

    function toInt(v, def) {
        var n = parseInt(v, 10);
        return (typeof n === 'number' && isFinite(n)) ? n : def;
    }

    function attachTemplatesAndClamp() {
        // Attach template objects by buff_id, then clamp stacks to max_stacks.
        var owners = Object.keys(instancesByOwner);
        var anyTemplate = false;
        for (var i = 0; i < owners.length; i++) {
            var arr = instancesByOwner[owners[i]];
            for (var j = 0; j < arr.length; j++) {
                var inst = arr[j];
                if (!inst || !inst.buff_id) continue;
                var tpl = templateById[inst.buff_id] || null;
                inst.template = tpl;
                if (tpl) {
                    anyTemplate = true;
                    // Buff 实例的有效层数下限为 1；0 层实例会让状态 Buff“存在但不可见/不生效”。
                    inst.stacks = Math.min(tpl.maxStacks, Math.max(1, toInt(inst.stacks, 1)));
                } else {
                    inst.stacks = Math.max(0, toInt(inst.stacks, 1));
                }
            }
        }
        return anyTemplate;
    }

    function applyPendingRestoreIfAny() {
        if (!pendingRestore) return;
        pendingRestore = null;
        attachTemplatesAndClamp();
        recalcDerived();
        notifyBuffHudRefresh();
    }

    function setState(saved) {
        if (!saved || typeof saved !== 'object') return;
        var instByOwner = saved.instancesByOwner;
        if (!isPlainObject(instByOwner)) instByOwner = null;

        // Reset current runtime instances first.
        instancesByOwner = {};

        var nowTick = getTickNow();
        if (!nowTick) {
            // In case GameTime isn't available yet, still restore without expiration pruning.
            nowTick = 0;
        }

        if (instByOwner) {
            var ownerIds = Object.keys(instByOwner);
            for (var i = 0; i < ownerIds.length; i++) {
                var oid = ownerIds[i];
                var arr = instByOwner[oid];
                if (!Array.isArray(arr)) continue;
                instancesByOwner[oid] = [];
                for (var j = 0; j < arr.length; j++) {
                    var inst = arr[j];
                    if (!inst || !inst.buff_id) continue;
                    instancesByOwner[oid].push({
                        uid: inst.uid != null ? String(inst.uid) : '',
                        buff_id: String(inst.buff_id),
                        owner_id: inst.owner_id != null ? String(inst.owner_id) : String(oid),
                        source_id: inst.source_id != null ? String(inst.source_id) : null,
                        started_tick: inst.started_tick != null ? toInt(inst.started_tick, 0) : toInt(nowTick, 0),
                        expires_at_tick: inst.expires_at_tick != null ? toInt(inst.expires_at_tick, nowTick) : toInt(nowTick, 0),
                        stacks: inst.stacks != null ? toInt(inst.stacks, 1) : 1,
                        template: null
                    });
                }
            }
        }

        // Prune expired by current tick.
        try {
            removeExpiredByTick(nowTick);
        } catch (e0) { /* ignore */ }

        if (loaded) {
            attachTemplatesAndClamp();
            recalcDerived();
            notifyBuffHudRefresh();
            pendingRestore = null;
        } else {
            // Keep pending: templates will be attached once buff config finishes loading.
            pendingRestore = { tick: nowTick };
        }
    }

    function eventMatchesTemplate(template, eventContext) {
        var kindOk = !template.triggerEventKind.length || template.triggerEventKind.indexOf(eventContext.event_kind) >= 0;
        if (!kindOk) return false;
        var nameOk = !template.triggerEventName.length || template.triggerEventName.indexOf(eventContext.event_name) >= 0;
        if (!nameOk) return false;
        if (!template.triggerTags.length) return true;
        var tags = arrayOrEmpty(eventContext.tags);
        for (var i = 0; i < template.triggerTags.length; i++) {
            if (tags.indexOf(template.triggerTags[i]) >= 0) return true;
        }
        return false;
    }

    function listenerSideMatches(inst, eventContext) {
        var side = inst.template.listenerSide || 'self';
        var owner = inst.owner_id;
        if (side === 'self') {
            if (eventContext.owner_id) return eventContext.owner_id === owner;
            if (eventContext.actor_id || eventContext.target_id) {
                return eventContext.actor_id === owner || eventContext.target_id === owner;
            }
            return owner === PLAYER_OWNER_ID;
        }
        if (side === 'actor') return eventContext.actor_id === owner;
        if (side === 'target') return eventContext.target_id === owner;
        if (side === 'both') return eventContext.actor_id === owner || eventContext.target_id === owner;
        return false;
    }

    function shouldConsume(inst, eventContext) {
        var mode = inst.template.consumeMode || 'always';
        if (mode === 'always') return true;
        if (mode === 'on_hit_roll_success') return !!eventContext.hit_roll_success;
        if (mode === 'on_effect_applied') return !!eventContext.effect_applied;
        return false;
    }

    function applySurvivalDeltaParams(p, eventContext) {
        p = p && typeof p === 'object' ? p : {};
        eventContext = eventContext && typeof eventContext === 'object' ? eventContext : {};
        var Surv = global && global.Survival;
        if (!Surv) return;
        var sat = safeNum(p.satiety, 0);
        var thi = safeNum(p.thirst, 0);
        var nut = safeNum(p.nutrition, 0);
        var sta = safeNum(p.stamina, 0);
        var ene = safeNum(p.energy, 0);
        var fat = safeNum(p.fatigue, 0);
        var mood = safeNum(p.mood, 0);
        var lethalSwitch = true;
        if (typeof Surv.getConfigValue === 'function') {
            lethalSwitch = !!Surv.getConfigValue('energy_depleted_lethal_on_combat_drain', true);
        }
        var combatEventName = String(eventContext.event_name || '');
        var isCombatEnergyDrainEvent = String(eventContext.event_kind || '') === 'combat'
            && (combatEventName === 'attack_damage_applied'
                || combatEventName === 'attack_subhit_resolved'
                || combatEventName === 'attack_hit_roll_resolved');
        var isCombatEnergyDrain = lethalSwitch
            && ene < 0
            && isCombatEnergyDrainEvent
            && (typeof hasBuffByBuffId === 'function')
            && hasBuffByBuffId(PLAYER_OWNER_ID, 'survival_energy_depleted');
        if (sat > 0 && typeof Surv.addSatiety === 'function') Surv.addSatiety(sat);
        if (thi > 0 && typeof Surv.addThirst === 'function') Surv.addThirst(thi);
        if (nut > 0 && typeof Surv.addNutrition === 'function') Surv.addNutrition(nut);
        if (fat !== 0 && typeof Surv.changeFatigue === 'function') Surv.changeFatigue(fat);
        if (sta < 0 && typeof Surv.consumeStamina === 'function') Surv.consumeStamina(-sta);
        if (ene > 0 && typeof Surv.addEnergy === 'function') Surv.addEnergy(ene);
        if (ene < 0 && typeof Surv.consumeEnergy === 'function') Surv.consumeEnergy(-ene);
        if (mood !== 0 && typeof Surv.setState === 'function') {
            var mCur = (typeof Surv.getState === 'function') ? (Surv.getState() || {}) : {};
            Surv.setState({ mood: safeNum(mCur.mood, 0) + mood });
        }
        if (isCombatEnergyDrain) {
            var tNow = Number(eventContext.tick);
            if (!isFinite(tNow) || tNow < 0) tNow = getTickNow();
            if (lastEnergyLethalTick !== tNow) {
                if (typeof Surv.setDead === 'function') {
                    Surv.setDead('energy_shatter');
                } else if (typeof Surv.setState === 'function') {
                    Surv.setState({ isDead: true, deathReason: 'energy_shatter' });
                }
                lastEnergyLethalTick = tNow;
                if (global && global.GameLog && typeof global.GameLog.log === 'function') {
                    var msg = (typeof global.ui === 'function')
                        ? global.ui('survival.death.energy_shatter')
                        : '精力涣散状态下遭受精力打击，精神崩溃死亡。';
                    global.GameLog.log(msg, 'warn');
                }
            }
        }

        // satiety/thirst/nutrition/stamina 正向增减（及前三者负向）统一走 setState，并由 Survival 内部 clamp。
        if ((sat < 0 || thi < 0 || nut < 0 || sta > 0) && typeof Surv.setState === 'function') {
            var cur = (typeof Surv.getState === 'function') ? (Surv.getState() || {}) : {};
            var next = {};
            if (sat < 0) next.satiety = safeNum(cur.satiety, 0) + sat;
            if (thi < 0) next.thirst = safeNum(cur.thirst, 0) + thi;
            if (nut < 0) next.nutrition = safeNum(cur.nutrition, 0) + nut;
            if (sta > 0) next.stamina = safeNum(cur.stamina, 0) + sta;
            Surv.setState(next);
        }
    }

    /** 到期或层数耗尽移除前调用；不经 triggerBuffPipeline（避免与 removeExpired 顺序死循环） */
    function applyExpireEffects(inst, tick) {
        var tpl = inst && inst.template;
        if (!tpl) return;
        var ef = arrayOrEmpty(tpl.expire_effects);
        if (!ef.length) return;
        var i;
        for (i = 0; i < ef.length; i++) {
            var e = ef[i] || {};
            if (e.type === 'survival_delta') {
                applySurvivalDeltaParams(e.params || {}, null);
            }
        }
        if (global.SceneCtx && typeof global.SceneCtx.updateStatusPanel === 'function') {
            try {
                global.SceneCtx.updateStatusPanel();
            } catch (ePan) { /* ignore */ }
        }
        debugLog('expire_effects buff=' + (tpl.buff_id || '') + ' tick=' + String(tick));
    }

    function applyEffects(inst, eventContext, chainState) {
        var effects = arrayOrEmpty(inst.template.effects);
        for (var i = 0; i < effects.length; i++) {
            var e = effects[i] || {};
            var type = e.type || '';
            var p = e.params || {};
            if (type === 'add_stat_delta') {
                // 实际加成汇总放到 recalcDerived，再统一重算
                continue;
            }
            if (type === 'survival_delta') {
                applySurvivalDeltaParams(p, eventContext);
                continue;
            }
            if (type === 'disable_movement' || type === 'disable_actions') {
                // 被动型效果：由 hasMovementDisabled / hasActionDisabled 查询生效，不在此直接改状态。
                continue;
            }
            if (type === 'apply_buff_if_has_buffs') {
                var owner = inst.owner_id || PLAYER_OWNER_ID;
                var required = arrayOrEmpty(p.required_buff_ids);
                var grantBuffId = String(p.grant_buff_id || '').trim();
                var allowReapply = !!p.allow_reapply;
                var allMet = !!grantBuffId;
                for (var rb = 0; rb < required.length; rb++) {
                    var reqId = String(required[rb] || '').trim();
                    if (!reqId || !hasBuffByBuffId(owner, reqId)) {
                        allMet = false;
                        break;
                    }
                }
                if (allMet && p.required_judgment_tags != null && isPlainObject(p.required_judgment_tags)) {
                    var reqJ = normalizeJudgmentTags(p.required_judgment_tags);
                    if (Object.keys(reqJ).length && !ownerHasBuffMatchingJudgmentTags(owner, reqJ)) {
                        allMet = false;
                    }
                }
                if (!allMet) continue;
                if (!allowReapply && hasBuffByBuffId(owner, grantBuffId)) continue;
                applyBuff(owner, grantBuffId, inst.buff_id, { tick: eventContext.tick });
                continue;
            }
            if (type === 'trigger_event') {
                var forwarded = {
                    event_id: makeEventId('buff_chain'),
                    tick: eventContext.tick,
                    event_kind: p.event_kind || eventContext.event_kind,
                    event_name: p.event_name || eventContext.event_name,
                    tags: arrayOrEmpty(p.tags),
                    actor_id: p.actor_id || eventContext.actor_id,
                    target_id: p.target_id || eventContext.target_id,
                    hit_roll_success: eventContext.hit_roll_success,
                    effect_applied: eventContext.effect_applied
                };
                triggerBuffPipeline(forwarded, chainState);
            }
        }
    }

    function recalcDerived() {
        var bonus = { jingu: 0, flexibility: 0, breath: 0, dexterity: 0, focus: 0 };
        var caState = (global && global.CharacterAttributes && typeof global.CharacterAttributes.getState === 'function')
            ? (global.CharacterAttributes.getState() || null)
            : null;
        var innate = (caState && caState.innate && typeof caState.innate === 'object') ? caState.innate : {};
        var owners = Object.keys(instancesByOwner);
        for (var i = 0; i < owners.length; i++) {
            var arr = instancesByOwner[owners[i]];
            for (var j = 0; j < arr.length; j++) {
                var inst = arr[j];
                if (!inst || !inst.template) continue;
                var effects = arrayOrEmpty(inst.template.effects);
                for (var k = 0; k < effects.length; k++) {
                    var e = effects[k] || {};
                    if (e.type === 'add_stat_delta') {
                        var p = e.params || {};
                        var mul = Math.max(1, inst.stacks || 1);
                        bonus.jingu += safeNum(p.jingu, 0) * mul;
                        bonus.flexibility += safeNum(p.flexibility, 0) * mul;
                        bonus.breath += safeNum(p.breath, 0) * mul;
                        bonus.dexterity += safeNum(p.dexterity, 0) * mul;
                        bonus.focus += safeNum(p.focus, 0) * mul;
                        continue;
                    }
                    if (e.type === 'add_acquired_from_congenital_percent') {
                        var pp = e.params || {};
                        var stacks = Math.max(1, parseInt(inst.stacks, 10) || 1);
                        var jinguPct = safeNum(pp.jingu_pct, 0) * stacks;
                        var flexibilityPct = safeNum(pp.flexibility_pct, 0) * stacks;
                        var breathPct = safeNum(pp.breath_pct, 0) * stacks;
                        var dexterityPct = safeNum(pp.dexterity_pct, 0) * stacks;
                        var focusPct = safeNum(pp.focus_pct, 0) * stacks;
                        if (jinguPct) bonus.jingu += Math.floor(safeNum(innate.jingu, 0) * jinguPct / 100);
                        if (flexibilityPct) bonus.flexibility += Math.floor(safeNum(innate.flexibility, 0) * flexibilityPct / 100);
                        if (breathPct) bonus.breath += Math.floor(safeNum(innate.breath, 0) * breathPct / 100);
                        if (dexterityPct) bonus.dexterity += Math.floor(safeNum(innate.dexterity, 0) * dexterityPct / 100);
                        if (focusPct) bonus.focus += Math.floor(safeNum(innate.focus, 0) * focusPct / 100);
                    }
                }
            }
        }
        if (global && global.CharacterAttributes && typeof global.CharacterAttributes.setExternalAcquiredBonus === 'function') {
            global.CharacterAttributes.setExternalAcquiredBonus(bonus);
            if (typeof global.CharacterAttributes.recalcCharacterStats === 'function' && global.InventoryEquipment) {
                global.CharacterAttributes.recalcCharacterStats({
                    getEquipmentState: function () { return global.InventoryEquipment.getState().equipment; },
                    getSkillsState: function () { return global.InventoryEquipment.getState().skills; },
                    getItemTemplate: global.InventoryEquipment.getItemTemplate,
                    getEnchantEntry: global.InventoryEquipment.getEnchantEntry,
                    getStrengthLevel: function () { return global.InventoryEquipment.getSkillLevel('survival_strength'); }
                });
            }
        }
    }

    function normalizeEventContext(eventContext) {
        var e = eventContext && typeof eventContext === 'object' ? eventContext : {};
        return {
            event_id: e.event_id || makeEventId('evt'),
            tick: (typeof e.tick === 'number') ? e.tick : getTickNow(),
            event_kind: e.event_kind || '',
            event_name: e.event_name || '',
            tags: arrayOrEmpty(e.tags),
            actor_id: e.actor_id || PLAYER_OWNER_ID,
            target_id: e.target_id || null,
            owner_id: e.owner_id || null,
            hit_roll_success: !!e.hit_roll_success,
            effect_applied: !!e.effect_applied,
            payload: e.payload || null
        };
    }

    function isRegistered(eventContext) {
        if (!eventContext.event_kind || !eventContext.event_name) return false;
        if (!registeredSet.kinds[eventContext.event_kind]) return false;
        if (!registeredSet.names[eventContext.event_name]) return false;
        return true;
    }

    function getCandidateTemplates(eventContext) {
        var keys = [
            eventContext.event_kind + ':' + eventContext.event_name,
            eventContext.event_kind + ':*',
            '*:' + eventContext.event_name,
            '*:*'
        ];
        var seen = {};
        var out = [];
        for (var i = 0; i < keys.length; i++) {
            var arr = indexByEvent[keys[i]] || [];
            for (var j = 0; j < arr.length; j++) {
                var t = arr[j];
                if (!seen[t.buff_id]) {
                    seen[t.buff_id] = true;
                    out.push(t);
                }
            }
        }
        return out;
    }

    function makeCandidateSet(candidates) {
        var set = {};
        for (var i = 0; i < candidates.length; i++) set[candidates[i].buff_id] = true;
        return set;
    }

    function flushPendingEvents() {
        if (!ready || !pendingEvents.length) return;
        var queued = pendingEvents.slice();
        pendingEvents.length = 0;
        for (var i = 0; i < queued.length; i++) {
            triggerBuffPipeline(queued[i]);
        }
    }

    function triggerBuffPipeline(eventContext, chainState) {
        var ev = normalizeEventContext(eventContext);
        if (!ready) {
            pendingEvents.push(ev);
            return { processed: 0, queued: true };
        }
        if (!isRegistered(ev)) {
            debugLog('skip unregistered event: ' + ev.event_kind + '/' + ev.event_name);
            return { processed: 0, skipped: true };
        }

        chainState = chainState || { depth: 0, seenEventIds: {} };
        if (chainState.depth > 16) {
            debugLog('skip deep chain depth=' + chainState.depth + ' event=' + ev.event_name);
            return { processed: 0, skipped: true, reason: 'max_depth' };
        }
        if (chainState.seenEventIds[ev.event_id]) {
            debugLog('skip repeated event_id=' + ev.event_id);
            return { processed: 0, skipped: true, reason: 'duplicate_event_id' };
        }
        chainState.seenEventIds[ev.event_id] = true;

        var expiredChanged = removeExpiredByTick(ev.tick);
        var candidates = getCandidateTemplates(ev);
        var candidateSet = makeCandidateSet(candidates);
        var owners = Object.keys(instancesByOwner);
        var active = [];
        var oi, ii;
        for (oi = 0; oi < owners.length; oi++) {
            var arr = instancesByOwner[owners[oi]];
            for (ii = 0; ii < arr.length; ii++) active.push(arr[ii]);
        }

        var matched = [];
        for (ii = 0; ii < active.length; ii++) {
            var inst = active[ii];
            if (!inst || !inst.template || inst.stacks <= 0) continue;
            if (!candidateSet[inst.buff_id]) continue;
            if (!listenerSideMatches(inst, ev)) continue;
            if (!eventMatchesTemplate(inst.template, ev)) continue;
            matched.push(inst);
        }
        matched.sort(function (a, b) {
            return safeNum(a.template.priority, 100) - safeNum(b.template.priority, 100);
        });

        var changed = !!expiredChanged;
        for (ii = 0; ii < matched.length; ii++) {
            var m = matched[ii];
            var consumeOk = shouldConsume(m, ev);
            var stacksBefore = m.stacks;
            if (consumeOk) {
                var consumed = Math.max(0, parseInt(m.template.consumeLayersFixed, 10) || 0);
                m.stacks = Math.max(0, m.stacks - consumed);
                changed = changed || consumed > 0;
            }
            var applyNow = (m.template.applyMode === 'always_apply') ? true : consumeOk;
            if (applyNow) {
                applyEffects(m, ev, {
                    depth: chainState.depth + 1,
                    seenEventIds: chainState.seenEventIds
                });
            }
            if (m.stacks <= 0) {
                applyExpireEffects(m, ev.tick);
                var ownArr = instancesByOwner[m.owner_id] || [];
                for (oi = ownArr.length - 1; oi >= 0; oi--) {
                    if (ownArr[oi].uid === m.uid) ownArr.splice(oi, 1);
                }
                changed = true;
            }
            debugLog('event=' + ev.event_name + ' buff=' + m.buff_id + ' stacks ' + stacksBefore + ' -> ' + m.stacks);
        }

        if (changed) {
            recalcDerived();
            notifyBuffHudRefresh();
            emitBuffStateChanged(PLAYER_OWNER_ID, 'pipeline_changed', { event_name: ev.event_name });
        }
        return { processed: matched.length, skipped: false, candidates: candidates.length };
    }

    function getCurrentTimeSnapshot() {
        if (!global || !global.GameTime || typeof global.GameTime.getState !== 'function') return null;
        var s = global.GameTime.getState();
        if (!s) return null;
        return {
            totalTicks: s.totalTicks,
            year: s.year,
            dayOfYear: s.dayOfYear,
            hour: s.hour,
            minute: s.minute,
            timePeriod: s.timePeriod
        };
    }

    function emitTimeEvents() {
        var cur = getCurrentTimeSnapshot();
        if (!cur) return;
        if (!timeSnapshot) {
            timeSnapshot = cur;
            return;
        }
        triggerBuffPipeline({
            event_kind: 'world',
            event_name: 'tick_advanced',
            tags: ['time', 'tick'],
            actor_id: PLAYER_OWNER_ID,
            payload: { from: timeSnapshot, to: cur }
        });
        if (cur.minute !== timeSnapshot.minute || cur.hour !== timeSnapshot.hour || cur.dayOfYear !== timeSnapshot.dayOfYear || cur.year !== timeSnapshot.year) {
            triggerBuffPipeline({
                event_kind: 'world',
                event_name: 'time_point_reached',
                tags: ['time'],
                actor_id: PLAYER_OWNER_ID,
                payload: { from: timeSnapshot, to: cur }
            });
        }
        timeSnapshot = cur;
    }

    function emitAttributeChangedIfNeeded() {
        if (!global || !global.CharacterAttributes || typeof global.CharacterAttributes.getState !== 'function') return;
        var st = global.CharacterAttributes.getState();
        if (!st || !st.innate || !st.acquired) return;
        var snapshot = {
            jingu: (st.innate.jingu || 0) + (st.acquired.jingu || 0),
            flexibility: (st.innate.flexibility || 0) + (st.acquired.flexibility || 0),
            breath: (st.innate.breath || 0) + (st.acquired.breath || 0),
            dexterity: (st.innate.dexterity || 0) + (st.acquired.dexterity || 0),
            focus: (st.innate.focus || 0) + (st.acquired.focus || 0)
        };
        if (!lastAttrSnapshot) {
            lastAttrSnapshot = snapshot;
            return;
        }
        var changed = [];
        var keys = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (snapshot[k] !== lastAttrSnapshot[k]) changed.push(k);
        }
        if (changed.length) {
            attrSeq += 1;
            triggerBuffPipeline({
                event_id: 'attr_changed_' + attrSeq,
                event_kind: 'world',
                event_name: 'attribute_changed',
                tags: ['attribute', 'player'],
                actor_id: PLAYER_OWNER_ID,
                payload: { from: lastAttrSnapshot, to: snapshot, changed: changed }
            });
        }
        lastAttrSnapshot = snapshot;
    }

    function patchHooks() {
        // 时间推进/生存 tick
        if (global && global.Survival && typeof global.Survival.advanceTick === 'function' && !global.Survival.__buffPatched) {
            var oldAdvance = global.Survival.advanceTick;
            global.Survival.advanceTick = function () {
                var ret = oldAdvance.apply(this, arguments);
                emitTimeEvents();
                return ret;
            };
            global.Survival.__buffPatched = true;
        }
        // 属性重算
        if (global && global.CharacterAttributes && typeof global.CharacterAttributes.recalcCharacterStats === 'function' && !global.CharacterAttributes.__buffPatched) {
            var oldRecalc = global.CharacterAttributes.recalcCharacterStats;
            global.CharacterAttributes.recalcCharacterStats = function () {
                var ret = oldRecalc.apply(this, arguments);
                emitAttributeChangedIfNeeded();
                return ret;
            };
            global.CharacterAttributes.__buffPatched = true;
        }
        // 对话（打开/关闭）
        if (global && global.DialogueUI && typeof global.DialogueUI.open === 'function' && !global.DialogueUI.__buffPatchedOpen) {
            var oldOpen = global.DialogueUI.open;
            global.DialogueUI.open = function () {
                var ret = oldOpen.apply(this, arguments);
                triggerBuffPipeline({
                    event_kind: 'dialogue',
                    event_name: 'dialogue_opened',
                    tags: ['dialogue'],
                    actor_id: PLAYER_OWNER_ID
                });
                return ret;
            };
            global.DialogueUI.__buffPatchedOpen = true;
        }
        if (global && global.DialogueUI && typeof global.DialogueUI.close === 'function' && !global.DialogueUI.__buffPatchedClose) {
            var oldClose = global.DialogueUI.close;
            global.DialogueUI.close = function () {
                var ret = oldClose.apply(this, arguments);
                triggerBuffPipeline({
                    event_kind: 'dialogue',
                    event_name: 'dialogue_closed',
                    tags: ['dialogue'],
                    actor_id: PLAYER_OWNER_ID
                });
                return ret;
            };
            global.DialogueUI.__buffPatchedClose = true;
        }
    }

    function notifyDialogueChoice(payload) {
        triggerBuffPipeline({
            event_kind: 'dialogue',
            event_name: 'dialogue_choice_confirmed',
            tags: ['dialogue'],
            actor_id: PLAYER_OWNER_ID,
            payload: payload || null
        });
        triggerBuffPipeline({
            event_kind: 'dialogue',
            event_name: 'dialogue_condition_changed',
            tags: ['dialogue', 'condition'],
            actor_id: PLAYER_OWNER_ID,
            payload: payload || null
        });
    }

    function notifyEnvironmentChanged(payload) {
        triggerBuffPipeline({
            event_kind: 'world',
            event_name: 'environment_param_changed',
            tags: ['world', 'environment'],
            actor_id: PLAYER_OWNER_ID,
            payload: payload || null
        });
    }

    function triggerRegisteredEvent(eventContext) {
        return triggerBuffPipeline(eventContext || {});
    }

    function getState() {
        return {
            loaded: loaded,
            version: config.version || 1,
            templateCount: config.buffs.length,
            ownerCount: Object.keys(instancesByOwner).length,
            instancesByOwner: instancesByOwner
        };
    }

    function resyncSurvivalStateBuffsAfterReady() {
        if (!global || !global.Survival) return;
        var Surv = global.Survival;
        if (typeof Surv.getState !== 'function' || typeof Surv.setState !== 'function') return;
        try {
            // Survival.setState 内部会统一重跑各生存段位 Buff 同步（satiety/thirst/nutrition/mood/temp/dirtyness/stamina/energy）。
            Surv.setState(Surv.getState());
        } catch (e) {
            debugLog('resync survival buffs after ready failed: ' + String(e && e.message ? e.message : e));
        }
    }

    function init() {
        fetchJson('data/editor/buff_event_registry.json', function (obj) {
            var wasReady = ready;
            registry.event_kinds = arrayOrEmpty(obj && obj.event_kinds);
            registry.event_names = arrayOrEmpty(obj && obj.event_names);
            registry.tags = arrayOrEmpty(obj && obj.tags);
            rebuildRegistrySets();
            pendingReady.registry = true;
            ready = pendingReady.registry && pendingReady.buffs;
            if (!wasReady && ready) resyncSurvivalStateBuffsAfterReady();
            flushPendingEvents();
        }, function () {
            var wasReady = ready;
            registry = { event_kinds: [], event_names: [], tags: [] };
            rebuildRegistrySets();
            pendingReady.registry = true;
            ready = pendingReady.registry && pendingReady.buffs;
            if (!wasReady && ready) resyncSurvivalStateBuffsAfterReady();
            flushPendingEvents();
        });
        fetchJson('data/buffs.json', function (obj) {
            var wasReady = ready;
            config.version = parseInt(obj && obj.version, 10) || 1;
            config.buffs = arrayOrEmpty(obj && obj.buffs).map(normalizeTemplate);
            rebuildIndexes();
            loaded = true;
            applyPendingRestoreIfAny();
            pendingReady.buffs = true;
            ready = pendingReady.registry && pendingReady.buffs;
            if (!wasReady && ready) resyncSurvivalStateBuffsAfterReady();
            flushPendingEvents();
        }, function () {
            var wasReady = ready;
            config = { version: 1, buffs: [] };
            rebuildIndexes();
            loaded = true;
            applyPendingRestoreIfAny();
            pendingReady.buffs = true;
            ready = pendingReady.registry && pendingReady.buffs;
            if (!wasReady && ready) resyncSurvivalStateBuffsAfterReady();
            flushPendingEvents();
        });
        patchHooks();
        timeSnapshot = getCurrentTimeSnapshot();
        emitAttributeChangedIfNeeded();
    }

    global.BuffSystem = {
        init: init,
        getState: getState,
        setState: setState,
        applyBuff: applyBuff,
        getBuffTemplate: getBuffTemplate,
        getBuffStacksSum: getBuffStacksSum,
        getParryChanceDeltaPercent: getParryChanceDeltaPercent,
        hasBuffByBuffId: hasBuffByBuffId,
        hasBuffMatchingJudgmentTags: function (ownerId, requiredTags) {
            return ownerHasBuffMatchingJudgmentTags(ownerId, requiredTags);
        },
        hasActiveSatietyDigestBuff: hasActiveSatietyDigestBuff,
        hasMovementDisabled: hasMovementDisabled,
        hasActionDisabled: hasActionDisabled,
        getDisabledActions: getDisabledActions,
        getProductionSuccessRateDeltaPercent: getProductionSuccessRateDeltaPercent,
        getBattlePotentialGainMultiplier: getBattlePotentialGainMultiplier,
        getBattleCombatExperienceGainMultiplier: getBattleCombatExperienceGainMultiplier,
        getBattleMoveSpeedMultiplier: getBattleMoveSpeedMultiplier,
        getBattleMoveSpeedDeltaPercent: getBattleMoveSpeedDeltaPercent,
        getBattleFinalDamageTakenMultiplier: getBattleFinalDamageTakenMultiplier,
        registerRuntimeBuffTemplate: registerRuntimeBuffTemplate,
        removeBuffByBuffId: removeBuffByBuffId,
        triggerBuffPipeline: triggerBuffPipeline,
        triggerRegisteredEvent: triggerRegisteredEvent,
        notifyEnvironmentChanged: notifyEnvironmentChanged,
        notifyDialogueChoice: notifyDialogueChoice
    };
})(typeof window !== 'undefined' ? window : this);
