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

    function arrayOrEmpty(v) {
        return Array.isArray(v) ? v : [];
    }

    function makeEventId(prefix) {
        eventSeq += 1;
        return String(prefix || 'evt') + '_' + String(Date.now()) + '_' + String(eventSeq);
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
        }
        return removed;
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
            existing.stacks = Math.min(tpl.maxStacks, Math.max(0, existing.stacks + tpl.stacksAddOnApply));
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
        return true;
    }

    function removeExpiredByTick(tick) {
        var changed = false;
        var owners = Object.keys(instancesByOwner);
        for (var i = 0; i < owners.length; i++) {
            var arr = instancesByOwner[owners[i]];
            for (var j = arr.length - 1; j >= 0; j--) {
                var inst = arr[j];
                if (inst.expires_at_tick <= tick) {
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
                    inst.stacks = Math.min(tpl.maxStacks, Math.max(0, toInt(inst.stacks, 1)));
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

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
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
        var owners = Object.keys(instancesByOwner);
        for (var i = 0; i < owners.length; i++) {
            var arr = instancesByOwner[owners[i]];
            for (var j = 0; j < arr.length; j++) {
                var inst = arr[j];
                if (!inst || !inst.template) continue;
                var effects = arrayOrEmpty(inst.template.effects);
                for (var k = 0; k < effects.length; k++) {
                    var e = effects[k] || {};
                    if (e.type !== 'add_stat_delta') continue;
                    var p = e.params || {};
                    var mul = Math.max(1, inst.stacks || 1);
                    bonus.jingu += safeNum(p.jingu, 0) * mul;
                    bonus.flexibility += safeNum(p.flexibility, 0) * mul;
                    bonus.breath += safeNum(p.breath, 0) * mul;
                    bonus.dexterity += safeNum(p.dexterity, 0) * mul;
                    bonus.focus += safeNum(p.focus, 0) * mul;
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

    function init() {
        fetchJson('data/editor/buff_event_registry.json', function (obj) {
            registry.event_kinds = arrayOrEmpty(obj && obj.event_kinds);
            registry.event_names = arrayOrEmpty(obj && obj.event_names);
            registry.tags = arrayOrEmpty(obj && obj.tags);
            rebuildRegistrySets();
            pendingReady.registry = true;
            ready = pendingReady.registry && pendingReady.buffs;
            flushPendingEvents();
        }, function () {
            registry = { event_kinds: [], event_names: [], tags: [] };
            rebuildRegistrySets();
            pendingReady.registry = true;
            ready = pendingReady.registry && pendingReady.buffs;
            flushPendingEvents();
        });
        fetchJson('data/buffs.json', function (obj) {
            config.version = parseInt(obj && obj.version, 10) || 1;
            config.buffs = arrayOrEmpty(obj && obj.buffs).map(normalizeTemplate);
            rebuildIndexes();
            loaded = true;
            applyPendingRestoreIfAny();
            pendingReady.buffs = true;
            ready = pendingReady.registry && pendingReady.buffs;
            flushPendingEvents();
        }, function () {
            config = { version: 1, buffs: [] };
            rebuildIndexes();
            loaded = true;
            applyPendingRestoreIfAny();
            pendingReady.buffs = true;
            ready = pendingReady.registry && pendingReady.buffs;
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
        removeBuffByBuffId: removeBuffByBuffId,
        triggerBuffPipeline: triggerBuffPipeline,
        triggerRegisteredEvent: triggerRegisteredEvent,
        notifyEnvironmentChanged: notifyEnvironmentChanged,
        notifyDialogueChoice: notifyDialogueChoice
    };
})(typeof window !== 'undefined' ? window : this);
