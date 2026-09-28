/**
 * 钓鱼作业状态机（设计 62 / k278 第五阶段）。
 *
 * 生态/点位系统只提交一次已经发生的接触事件；本模块负责真实钓组引用、
 * 整数 tick、挂饵消耗、受力、永久磨损、断线下游损失与存档连续性。
 */
(function (global) {
    'use strict';

    var VERSION = 1;
    var PHASES = ['ready', 'waiting', 'signal', 'fight', 'landed', 'ended'];
    var config = null;
    var state = { version: VERSION, serial: 0, active: null };
    var hostOverride = null;

    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function IE() { return global.InventoryEquipment || null; }
    function Assembly() { return global.ItemAssembly || null; }
    function finite(value, fallback) { var n = Number(value); return isFinite(n) ? n : fallback; }
    function integer(value, fallback) { var n = Math.floor(Number(value)); return isFinite(n) ? n : fallback; }

    function defaultHost() {
        return {
            stamina: function () {
                var S = global.Survival;
                return S && S.getActionStaminaBudget ? S.getActionStaminaBudget() : S && S.getState ? finite((S.getState() || {}).stamina, 0) : Infinity;
            },
            spendStamina: function (amount) {
                var S = global.Survival;
                if (S && S.consumeStamina) S.consumeStamina(amount);
            },
            advanceTick: function () {
                var S = global.Survival;
                if (S && S.advanceTick) S.advanceTick();
            }
        };
    }
    function host() { return hostOverride || defaultHost(); }

    function configure(next) {
        if (!next || Number(next.schema_version) !== 1 || !next.action_costs) return false;
        config = clone(next);
        return true;
    }
    function setHost(next) { hostOverride = next || null; }
    function ready() { return !!(config && IE() && Assembly()); }

    function rootRecord() {
        var inv = IE();
        return state.active && inv && inv.findItemInstanceRecord ? inv.findItemInstanceRecord(state.active.rig_instance_id) : null;
    }
    function getTemplateValue(inst, field) {
        var inv = IE();
        if (!inv || !inst) return undefined;
        var tpl = inv.getItemTemplate ? inv.getItemTemplate(inst.item_id) : null;
        return inv.getItemTemplateValue ? inv.getItemTemplateValue(tpl, field) : (tpl ? tpl[field] : undefined);
    }
    function walk(root, callback, depth) {
        if (!root || !root.item_id) return;
        callback(root, depth || 0);
        var inv = IE();
        var children = inv && inv.getItemInstanceChildren ? inv.getItemInstanceChildren(root) : [];
        children.forEach(function (entry) { walk(entry.instance, callback, (depth || 0) + 1); });
    }
    function findByType(root, wanted) {
        var found = null;
        var A = Assembly();
        walk(root, function (inst) {
            if (found || !A || !A.getPartTypes) return;
            if (A.getPartTypes(inst).indexOf(wanted) >= 0) found = inst;
        }, 0);
        return found;
    }
    function baitInstance(root) { return findByType(root, 'fishing.bait'); }

    function pay(actionId) {
        var spec = config && config.action_costs ? config.action_costs[actionId] : null;
        if (!spec) return { ok: false, reason: 'unknown_action' };
        var h = host();
        var stamina = Math.max(0, finite(spec.stamina, 0));
        if (h.stamina && finite(h.stamina(), 0) < stamina) return { ok: false, reason: 'stamina' };
        if (stamina > 0 && h.spendStamina) h.spendStamina(stamina);
        var ticks = Math.max(0, integer(spec.ticks, 0));
        for (var i = 0; i < ticks; i++) if (h.advanceTick) h.advanceTick();
        if (state.active) state.active.elapsed_ticks += ticks;
        return { ok: true, ticks: ticks, stamina: stamina, spec: spec };
    }

    function validateRig(root) {
        var A = Assembly();
        if (!root || !A) return { ok: false, reason: 'rig_not_found' };
        if (A.getPartTypes(root).indexOf('fishing.rig_root') < 0) return { ok: false, reason: 'not_fishing_rig' };
        var structural = A.validateAssembly(root, { requireComplete: true });
        if (!structural.ok) return { ok: false, reason: 'rig_incomplete', validation: structural };
        var broken = null;
        walk(root, function (inst) { if (!broken && inst.fishing_broken === true) broken = inst; }, 0);
        if (broken) return { ok: false, reason: 'rig_broken', broken_instance_id: broken.instance_id };
        return { ok: true };
    }

    function start(rigInstanceId, pointId) {
        if (!ready()) return { ok: false, reason: 'unavailable' };
        if (state.active) return { ok: false, reason: 'already_active' };
        var record = IE().findItemInstanceRecord(String(rigInstanceId || ''));
        var checked = validateRig(record && record.instance);
        if (!checked.ok) return checked;
        state.serial += 1;
        state.active = {
            session_id: 'fish:' + state.serial,
            point_id: String(pointId || 'unknown'),
            rig_instance_id: record.instance.instance_id,
            phase: 'ready',
            needs_retrieval: false,
            elapsed_ticks: 0,
            last_feedback: 'rig_checked',
            drag: 'medium',
            cast_bait_instance_id: null,
            contact: null,
            overload_counts: {},
            progress: 0,
            hook_hold: 0,
            pending_catch: null,
            last_loss: null
        };
        return { ok: true, session_id: state.active.session_id };
    }

    function cast() {
        var a = state.active;
        if (!a || a.phase !== 'ready') return { ok: false, reason: 'phase' };
        var record = rootRecord();
        var checked = validateRig(record && record.instance);
        if (!checked.ok) return checked;
        var bait = baitInstance(record.instance);
        var castBaitId = bait ? bait.instance_id : null;
        var paid = pay(findByType(record.instance, 'fishing.lure_rod') ? 'lure_cast' : 'cast');
        if (!paid.ok) return paid;
        a.cast_bait_instance_id = castBaitId;
        a.phase = 'waiting';
        a.needs_retrieval = true;
        a.last_feedback = 'rig_settled';
        a.contact = null;
        return { ok: true, phase: a.phase, bait_was_present: !!a.cast_bait_instance_id, paid: paid };
    }

    function isLure() { var root=rootRecord(); return !!(root && findByType(root.instance,'fishing.lure_rod')); }
    function lureStep(style, speed) {
        if(!isLure()||!state.active||state.active.phase!=='waiting'||['steady','pause','twitch'].indexOf(style)<0||['slow','medium','fast'].indexOf(speed)<0)return {ok:false,reason:'phase'};
        var paid=pay('lure_'+style+'_'+speed);if(!paid.ok)return paid;state.active.last_feedback='lure_moves';return {ok:true,paid:paid};
    }
    function finishLure() {
        if(!isLure()||!state.active||state.active.phase!=='waiting')return {ok:false,reason:'phase'};
        state.active.phase='ready';state.active.needs_retrieval=false;state.active.contact=null;state.active.last_feedback='rig_retrieved';return {ok:true};
    }
    function setDrag(value) {
        var a=state.active,root=rootRecord();
        if(!a||!root||!findByType(root.instance,'fishing.reel')||!config.drag[value]||['ready','fight'].indexOf(a.phase)<0)return {ok:false,reason:'phase'};
        if(a.drag===value)return {ok:true};
        if(a.phase==='fight'){var paid=pay('drag_adjust');if(!paid.ok)return paid;}
        a.drag=value;return {ok:true};
    }
    function waitTick() {
        if(isLure())return {ok:false,reason:'lure_requires_work'};
        var a = state.active;
        if (!a || a.phase !== 'waiting') return { ok: false, reason: 'phase' };
        var paid = pay('wait');
        if (!paid.ok) return paid;
        a.last_feedback = 'no_obvious_movement';
        return { ok: true, phase: a.phase, paid: paid };
    }

    /** 水域事件提供者调用；隐藏的鱼种、负载与行为不会进入玩家反馈。 */
    function acceptContactEvent(event) {
        var a = state.active;
        if (!a || a.phase !== 'waiting') return { ok: false, reason: 'phase' };
        var e = event && typeof event === 'object' ? clone(event) : null;
        if (!e || !String(e.event_id || '') || finite(e.load_rating, 0) <= 0 || finite(e.endurance, 0) <= 0) return { ok: false, reason: 'invalid_contact' };
        e.event_id = String(e.event_id);
        e.load_rating = Math.max(1, integer(e.load_rating, 1));
        e.endurance = Math.max(1, integer(e.endurance, 1));
        e.hook_fit = ['good', 'fair', 'difficult'].indexOf(e.hook_fit) >= 0 ? e.hook_fit : 'fair';
        e.behavior_sequence = Array.isArray(e.behavior_sequence) && e.behavior_sequence.length ? e.behavior_sequence.map(function (b) {
            return {
                id: String((b && b.id) || 'movement'),
                load_delta: integer(b && b.load_delta, 0),
                progress_delta: integer(b && b.progress_delta, 0),
                hook_delta: integer(b && b.hook_delta, 0)
                ,pull_pulses: !!(b && b.pull_pulses)
            };
        }) : [{ id: 'movement', load_delta: 0, progress_delta: 0, hook_delta: 0 }];
        e.behavior_index = 0;
        e.takes_bait_on_strike = e.takes_bait_on_strike !== false;
        a.contact = e;
        a.phase = 'signal';
        a.last_feedback = String(e.visible_signal || 'clear_movement');
        return { ok: true, phase: a.phase, feedback: a.last_feedback };
    }

    function consumeConnectedBait(root) {
        var bait = baitInstance(root);
        if (!bait) return { ok: true, consumed: false };
        var record = IE().findItemInstanceRecord(bait.instance_id);
        if (!record || record.relation !== 'connection' || !record.parent) return { ok: false, reason: 'bait_relation_invalid' };
        var removed = Assembly().discardConnectionSubtree(record.parent.instance_id, record.relation_key);
        return removed.ok ? { ok: true, consumed: true, bait_instance_id: bait.instance_id } : removed;
    }

    function strike(force) {
        var a = state.active;
        if (!a || a.phase !== 'signal' || !a.contact) return { ok: false, reason: 'phase' };
        var level = ['light', 'normal', 'strong'].indexOf(force) >= 0 ? force : 'normal';
        var root = rootRecord();
        if (!root) return { ok: false, reason: 'rig_not_found' };
        var base = integer(config.hook_force[level], 0);
        var penalty = integer(config.hook_fit_penalty[a.contact.hook_fit], 1);
        a.hook_hold = a.contact.in_mouth === false ? 0 : Math.max(0, Math.min(3, base - penalty));
        var consumed = { ok: true, consumed: false };
        if (a.contact.takes_bait_on_strike && root) consumed = consumeConnectedBait(root.instance);
        if (!consumed.ok) return consumed;
        if (a.hook_hold <= 0) {
            var briefPull = a.contact.in_mouth === true && config.missed_in_mouth_pull === true;
            a.phase = 'ready';
            a.last_feedback = 'no_sustained_pull';
            a.contact = null;
            a.needs_retrieval = false;
            return { ok: true, hooked: false, brief_contact: briefPull, bait_consumed: consumed.consumed };
        }
        a.phase = 'fight';
        a.progress = 0;
        a.last_feedback = 'sustained_pull';
        if (level === 'strong') a.contact.load_rating += Math.max(0, integer(config.strong_strike_load_bonus, 0));
        return { ok: true, hooked: true, hook_hold: a.hook_hold, bait_consumed: consumed.consumed };
    }

    function loadBearingParts(root) {
        var out = [];
        walk(root, function (inst, depth) {
            var rating = integer(getTemplateValue(inst, 'fishing_load_rating'), 0);
            if (rating > 0) out.push({ instance: inst, depth: depth, base_rating: rating });
        }, 0);
        return out;
    }
    function applyLoad(root, load) {
        var a = state.active;
        var parts = loadBearingParts(root);
        var breakCandidates = [];
        var stressed = [];
        parts.forEach(function (entry) {
            var inst = entry.instance;
            var wear = Math.max(0, Math.min(integer(config.max_wear_stage, 2), integer(inst.fishing_wear_stage, 0)));
            var effective = Math.max(1, entry.base_rating - wear);
            var diff = load - effective;
            var id = inst.instance_id;
            var count = Math.max(0, integer(a.overload_counts[id], 0));
            if (diff <= 0) {
                a.overload_counts[id] = Math.max(0, count - 1);
                return;
            }
            stressed.push({ instance_id: id, difference: diff });
            if (diff === 1) {
                count += 1;
                a.overload_counts[id] = count;
                inst.fishing_wear_stage = Math.min(integer(config.max_wear_stage, 2), wear + 1);
                if (count >= Math.max(1, integer(config.overload_break_count, 2))) breakCandidates.push({ entry: entry, effective: effective, difference: diff });
            } else {
                breakCandidates.push({ entry: entry, effective: effective, difference: diff });
            }
        });
        if (!breakCandidates.length) return { ok: true, broken: false, stressed: stressed };
        breakCandidates.sort(function (x, y) {
            return x.effective - y.effective || y.entry.depth - x.entry.depth;
        });
        var broken = breakCandidates[0].entry.instance;
        broken.fishing_broken = true;
        var rec = IE().findItemInstanceRecord(broken.instance_id);
        if (rec && rec.relation === 'connection' && rec.parent) {
            var discarded = Assembly().discardConnectionSubtree(rec.parent.instance_id, rec.relation_key);
            if (!discarded.ok) return discarded;
            return { ok: true, broken: true, broken_item_id: broken.item_id, broken_instance_id: broken.instance_id, lost: discarded };
        }
        return { ok: true, broken: true, broken_item_id: broken.item_id, broken_instance_id: broken.instance_id, root_broken: true, lost: null };
    }

    function fightStep(strategy) {
        var a = state.active;
        if (!a || a.phase !== 'fight' || !a.contact) return { ok: false, reason: 'phase' };
        var mode = strategy === 'strong' ? 'strong' : strategy === 'give' ? 'give' : 'steady';
        var root = rootRecord();
        if (!root) return { ok: false, reason: 'rig_not_found' };
        if(mode==='give'&&!findByType(root.instance,'fishing.reel'))return {ok:false,reason:'no_reel'};
        var paid = pay('fight_'+mode);
        if (!paid.ok) return paid;
        var seq = a.contact.behavior_sequence;
        var behavior = seq[Math.min(a.contact.behavior_index, seq.length - 1)];
        a.contact.current_pull_pulses = behavior.pull_pulses === true;
        a.contact.behavior_index += 1;
        var load = Math.max(1, a.contact.load_rating + integer(behavior.load_delta, 0) + integer(paid.spec.load_delta, 0));
        var drag = findByType(root.instance,'fishing.reel') && config.drag[a.drag||'medium'];
        var slipping = !!(drag && load>drag.load_cap);
        if(drag)load=Math.min(load,drag.load_cap);
        var loadResult = applyLoad(root.instance, load);
        if (!loadResult.ok) return loadResult;
        if (loadResult.broken) {
            a.phase = 'ended';
            a.last_feedback = 'sudden_slack';
            a.last_loss = clone(loadResult.lost);
            return { ok: true, phase: a.phase, load: load, broken: loadResult };
        }
        a.hook_hold = Math.max(0, a.hook_hold + integer(behavior.hook_delta, 0) - (mode === 'strong' && behavior.id === 'surge' ? 1 : 0));
        if (a.hook_hold <= 0) {
            a.phase = 'ended';
            a.last_feedback = 'sudden_slack';
            return { ok: true, phase: a.phase, load: load, fish_lost: true, stressed: loadResult.stressed };
        }
        a.progress = Math.max(0, a.progress + integer(paid.spec.progress, 0) + integer(behavior.progress_delta, 0) + (slipping ? integer(drag.slip_progress,0) : 0));
        if (a.progress >= a.contact.endurance) {
            a.phase = 'landed';
            a.pending_catch = {
                event_id: a.contact.event_id,
                catch_profile_id: a.contact.catch_profile_id ? String(a.contact.catch_profile_id) : null
            };
            a.last_feedback = 'catch_at_bank';
        } else {
            a.last_feedback = slipping ? 'line_pays_out' : behavior.id === 'surge' ? 'line_under_strong_pull' : 'pull_changes';
        }
        return { ok: true, phase: a.phase, load: load, progress: a.progress, hook_hold: a.hook_hold, stressed: loadResult.stressed };
    }

    // Reuse the discrete load table for an obstacle; caller pays the tick.
    function obstacleLoad(load) {
        var a = state.active, root = rootRecord();
        if (!a || !root || ['waiting', 'signal', 'fight'].indexOf(a.phase) < 0 || !Number.isInteger(load) || load < 1) return {ok:false,reason:'phase'};
        var drag=findByType(root.instance,'fishing.reel')&&config.drag[a.drag||'medium'];
        var slipping=!!(drag&&load>drag.load_cap);if(drag)load=Math.min(load,drag.load_cap);
        var result = applyLoad(root.instance, load);result.slipping=slipping;
        if (result.broken) { a.phase='ended'; a.last_feedback='sudden_slack'; a.last_loss=clone(result.lost); }
        return result;
    }

    function retrieve() {
        var a = state.active;
        if (!a || (['waiting', 'signal'].indexOf(a.phase) < 0 && !(a.phase==='ended'&&a.needs_retrieval))) return { ok: false, reason: 'phase' };
        var root = rootRecord();
        if (!root) return { ok: false, reason: 'rig_not_found' };
        var paid = pay('retrieve');
        if (!paid.ok) return paid;
        var castBaitId = a.cast_bait_instance_id;
        var baitStillThere = !!(root && castBaitId && Assembly().treeContains(root.instance, castBaitId));
        var baitMissing = !!castBaitId && !baitStillThere;
        a.phase = 'ready';
        a.needs_retrieval = false;
        a.contact = null;
        a.last_feedback = baitMissing ? 'bait_missing_on_retrieve' : 'rig_retrieved';
        a.cast_bait_instance_id = baitStillThere ? castBaitId : null;
        return { ok: true, phase: a.phase, bait_missing: baitMissing, paid: paid, feedback: a.last_feedback };
    }

    function cutLine() {
        var a = state.active;
        if (!a || (['waiting', 'signal', 'fight'].indexOf(a.phase) < 0 && !(a.phase==='ended'&&a.needs_retrieval))) return { ok: false, reason: 'phase' };
        var root = rootRecord();
        if (!root) return { ok: false, reason: 'rig_not_found' };
        var line=findByType(root.instance,'fishing.main_line'),rec=line&&IE().findItemInstanceRecord(line.instance_id);
        if(!rec||!rec.parent){if(a.phase==='ended'&&a.needs_retrieval){a.needs_retrieval=false;return {ok:true};}return {ok:false,reason:'rig_incomplete'};}
        var lost = Assembly().discardConnectionSubtree(rec.parent.instance_id, rec.relation_key);
        if (!lost.ok) return lost;
        a.phase = 'ended';
        a.needs_retrieval = false;
        a.last_feedback = 'line_cut';
        a.last_loss = clone(lost);
        return { ok: true, phase: a.phase, lost: lost };
    }

    function resolveCatch(disposition) {
        var a = state.active;
        if (!a || a.phase !== 'landed' || !a.pending_catch) return { ok: false, reason: 'phase' };
        var result = clone(a.pending_catch);
        result.disposition = disposition === 'keep' ? 'keep' : 'release';
        a.pending_catch = null;
        a.needs_retrieval = false;
        a.contact = null;
        a.phase = 'ready';
        a.last_feedback = result.disposition === 'keep' ? 'catch_kept' : 'catch_released';
        return { ok: true, catch: result };
    }

    function close() {
        if (!state.active) return { ok: true };
        if (state.active.needs_retrieval || ['ready', 'ended'].indexOf(state.active.phase) < 0) return { ok: false, reason: 'must_resolve' };
        state.active = null;
        return { ok: true };
    }

    // A paid tick may contain a bounded follow-up decision. No new clock or reroll here.
    function continueSignal(next) {
        var a = state.active;
        if (!a || a.phase !== 'signal') return { ok: false, reason: 'phase' };
        a.phase = 'waiting';
        a.contact = null;
        a.last_feedback = 'no_obvious_movement';
        return next ? acceptContactEvent(next) : { ok: true };
    }

    function isInstanceLocked(instanceId) {
        if (!state.active || (['waiting', 'signal', 'fight', 'landed'].indexOf(state.active.phase) < 0 && !state.active.needs_retrieval)) return false;
        var root = rootRecord();
        return !!(root && Assembly().treeContains(root.instance, instanceId));
    }

    function getPublicState() {
        if (!state.active) return { active: null };
        var a = state.active;
        var root = rootRecord();
        return {
            active: {
                session_id: a.session_id,
                point_id: a.point_id,
                phase: a.phase,
                elapsed_ticks: a.elapsed_ticks,
                last_feedback: a.last_feedback,
                combined_weight_kg: root && IE().getItemCombinedWeight ? IE().getItemCombinedWeight(root.instance) : null,
                has_pending_catch: !!a.pending_catch
            }
        };
    }

    function validate(s) {
        if (s == null) return true;
        if (!s || Number(s.version) !== VERSION || !Number.isInteger(s.serial) || s.serial < 0) return false;
        if (s.active == null) return true;
        var a = s.active;
        if (!a || PHASES.indexOf(a.phase) < 0 || typeof a.rig_instance_id !== 'string' || !a.rig_instance_id) return false;
        if (typeof a.session_id !== 'string' || !a.session_id || typeof a.point_id !== 'string' || typeof a.last_feedback !== 'string') return false;
        if(a.needs_retrieval!=null&&typeof a.needs_retrieval!=='boolean')return false;
        if (a.drag!=null&&['loose','medium','tight'].indexOf(a.drag)<0)return false;
        if (a.cast_bait_instance_id != null && typeof a.cast_bait_instance_id !== 'string') return false;
        if (!Number.isInteger(a.elapsed_ticks) || a.elapsed_ticks < 0 || !a.overload_counts || typeof a.overload_counts !== 'object' || Array.isArray(a.overload_counts)) return false;
        if (!Number.isInteger(a.progress) || a.progress < 0 || !Number.isInteger(a.hook_hold) || a.hook_hold < 0 || a.hook_hold > 3) return false;
        var overloadIds = Object.keys(a.overload_counts);
        for (var i = 0; i < overloadIds.length; i++) {
            if (!Number.isInteger(a.overload_counts[overloadIds[i]]) || a.overload_counts[overloadIds[i]] < 0) return false;
        }
        if (a.contact != null) {
            if (!a.contact.event_id || finite(a.contact.load_rating, 0) <= 0 || finite(a.contact.endurance, 0) <= 0 || ['good', 'fair', 'difficult'].indexOf(a.contact.hook_fit) < 0 || !Array.isArray(a.contact.behavior_sequence) || !a.contact.behavior_sequence.length) return false;
            if (!Number.isInteger(a.contact.behavior_index) || a.contact.behavior_index < 0) return false;
            for (var j = 0; j < a.contact.behavior_sequence.length; j++) {
                var behavior = a.contact.behavior_sequence[j];
                if (!behavior || typeof behavior.id !== 'string' || !Number.isInteger(behavior.load_delta) || !Number.isInteger(behavior.progress_delta) || !Number.isInteger(behavior.hook_delta)) return false;
            }
        }
        if (['signal', 'fight'].indexOf(a.phase) >= 0 && a.contact == null) return false;
        if (a.phase === 'landed' && (!a.pending_catch || typeof a.pending_catch.event_id !== 'string')) return false;
        return true;
    }
    function getState() { return clone(state); }
    function setState(next) {
        if (!validate(next)) return false;
        var candidate = next ? clone(next) : { version: VERSION, serial: 0, active: null };
        if (candidate.active && IE() && IE().findItemInstanceRecord && !IE().findItemInstanceRecord(candidate.active.rig_instance_id)) return false;
        if(candidate.active && candidate.active.needs_retrieval == null) candidate.active.needs_retrieval = ['waiting','signal','fight','landed'].indexOf(candidate.active.phase)>=0;
        state = candidate;
        return true;
    }

    global.FishingSession = {
        VERSION: VERSION,
        configure: configure,
        setHost: setHost,
        ready: ready,
        start: start,
        cast: cast,
        waitTick: waitTick,
        lureStep: lureStep,
        finishLure: finishLure,
        setDrag: setDrag,
        acceptContactEvent: acceptContactEvent,
        continueSignal: continueSignal,
        strike: strike,
        fightStep: fightStep,
        retrieve: retrieve,
        obstacleLoad: obstacleLoad,
        cutLine: cutLine,
        resolveCatch: resolveCatch,
        close: close,
        isInstanceLocked: isInstanceLocked,
        getPublicState: getPublicState,
        getState: getState,
        setState: setState,
        validate: validate,
        validateRig: validateRig
    };
})(typeof window !== 'undefined' ? window : globalThis);
