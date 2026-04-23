(function (global) {
    'use strict';

    var STATUS_IDLE = 'IDLE';
    var STATUS_FERMENTING = 'FERMENTING';
    var STATUS_SETTLED = 'SETTLED';
    var MODE_AEROBIC = 'aerobic';
    var MODE_ANAEROBIC = 'anaerobic';

    var AEROBIC_TRIGGERS = [48, 96, 144, 192, 240];
    var ANAEROBIC_TRIGGERS = [336, 672];

    var cfg = {
        aerobic_duration_ticks: 288,
        anaerobic_duration_ticks: 1008,
        aerobic_void_item_id: 'compost_matrix_batch_void',
        anaerobic_void_item_id: 'fertilizer_batch_void',
        anaerobic_tier_item_ids: {
            low: 'fertilizer_basic_low',
            mid: 'fertilizer_basic',
            high: 'fertilizer_compost_plus'
        },
        anaerobic_failure_buff_id: '沤肥满身'
    };

    var eventsById = {};
    var aerobicStateEventIds = [];
    var anaerobicVentEventIds = [];
    var hooks = {
        on_batch_started: null,
        on_window_interacted: null
    };

    var state = {
        batches: {
            aerobic: createIdleBatch(MODE_AEROBIC),
            anaerobic: createIdleBatch(MODE_ANAEROBIC)
        }
    };

    function createIdleBatch(mode) {
        return {
            mode: mode,
            status: STATUS_IDLE,
            abortable: false,
            age_ticks: 0,
            duration_ticks: getDurationForMode(mode),
            materials: [],
            inoculant_item_id: null,
            c_total: 0,
            n_total: 0,
            ratio: null,
            legal_cn: false,
            base_tier: null,
            final_tier: null,
            compost_ops_score: 0,
            windows: [],
            pending_window_index: -1,
            results: [],
            settled_reason: null,
            pending_effects: []
        };
    }

    function normalizeTier(t) {
        var x = String(t || '').toLowerCase();
        if (x === 'high' || x === 'mid' || x === 'low') return x;
        return 'low';
    }

    function getDurationForMode(mode) {
        return mode === MODE_ANAEROBIC
            ? Math.max(1, Math.floor(Number(cfg.anaerobic_duration_ticks) || 1008))
            : Math.max(1, Math.floor(Number(cfg.aerobic_duration_ticks) || 288));
    }

    function clampTierByShift(baseTier, shift) {
        var order = ['low', 'mid', 'high'];
        var idx = order.indexOf(normalizeTier(baseTier));
        if (idx < 0) idx = 0;
        idx = Math.max(0, Math.min(order.length - 1, idx + shift));
        return order[idx];
    }

    function rollInclusiveInt(min, max) {
        var a = Math.floor(Number(min) || 0);
        var b = Math.floor(Number(max) || 0);
        if (b < a) {
            var t = a; a = b; b = t;
        }
        return a + Math.floor(Math.random() * (b - a + 1));
    }

    function computeTierFromRatio(ratio) {
        var r = Number(ratio);
        if (!isFinite(r) || r <= 0) return 'low';
        if (r >= 25 && r <= 35) return 'high';
        if ((r >= 18 && r < 25) || (r > 35 && r <= 45)) return 'mid';
        return 'low';
    }

    function hasOwn(obj, key) {
        return !!(obj && Object.prototype.hasOwnProperty.call(obj, key));
    }

    function isIntegerLikeNumber(v) {
        var n = Number(v);
        return isFinite(n) && Math.floor(n) === n;
    }

    function isTemplateEligibleMainMaterial(tpl) {
        if (!tpl || typeof tpl !== 'object') return false;
        var hasC = hasOwn(tpl, 'fert_c') && isIntegerLikeNumber(tpl.fert_c);
        var hasN = hasOwn(tpl, 'fert_n') && isIntegerLikeNumber(tpl.fert_n);
        return hasC || hasN;
    }

    function isTemplateEligibleInoculant(tpl, mode) {
        if (!tpl || typeof tpl !== 'object') return false;
        var m = mode === MODE_ANAEROBIC ? MODE_ANAEROBIC : MODE_AEROBIC;
        if (m === MODE_ANAEROBIC) return tpl.compost_inoculant_anaerobic === true;
        return tpl.compost_inoculant_aerobic === true;
    }

    function computeCnTotalsFromInputItems(items, options) {
        var arr = Array.isArray(items) ? items : [];
        var opts = options || {};
        var getTemplate = typeof opts.getTemplate === 'function' ? opts.getTemplate : null;
        var includeOnlyEligibleMain = opts.include_only_eligible_main !== false;
        var cTotal = 0;
        var nTotal = 0;
        var invalidCount = 0;
        var includedCount = 0;
        for (var i = 0; i < arr.length; i++) {
            var raw = arr[i];
            var itemId = '';
            var count = 1;
            var tpl = null;
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                itemId = raw.item_id != null ? String(raw.item_id) : '';
                count = Math.max(1, Math.floor(Number(raw.count) || 1));
                tpl = raw.tpl && typeof raw.tpl === 'object' ? raw.tpl : null;
            } else {
                itemId = raw != null ? String(raw) : '';
            }
            if (!tpl && getTemplate && itemId) tpl = getTemplate(itemId);
            var eligible = isTemplateEligibleMainMaterial(tpl);
            if (!eligible) {
                invalidCount += count;
                if (includeOnlyEligibleMain) continue;
            }
            includedCount += count;
            var cOne = Math.floor(Number(tpl && tpl.fert_c) || 0);
            var nOne = Math.floor(Number(tpl && tpl.fert_n) || 0);
            cTotal += cOne * count;
            nTotal += nOne * count;
        }
        var legalCn = cTotal > 0 && nTotal > 0;
        return {
            c_total: cTotal,
            n_total: nTotal,
            legal_cn: legalCn,
            ratio: legalCn ? (cTotal / nTotal) : null,
            included_main_count: includedCount,
            invalid_main_count: invalidCount
        };
    }

    function classifyCnFeedbackByTotals(cTotal, nTotal, mode) {
        var c = Math.floor(Number(cTotal) || 0);
        var n = Math.floor(Number(nTotal) || 0);
        var m = mode === MODE_ANAEROBIC ? MODE_ANAEROBIC : MODE_AEROBIC;
        if (c <= 0 || n <= 0) {
            return {
                tier: 'fatal',
                severity: 'fatal',
                text_key: 'compost.perception.void',
                ratio: null
            };
        }
        var ratio = c / n;
        if (ratio >= 25 && ratio <= 35) {
            return {
                tier: 'good',
                severity: 'good',
                text_key: 'compost.perception.good',
                ratio: ratio
            };
        }
        if ((ratio >= 18 && ratio < 25) || (ratio > 35 && ratio <= 45)) {
            return {
                tier: 'mid',
                severity: 'mid',
                text_key: 'compost.perception.mid',
                ratio: ratio
            };
        }
        return {
            tier: 'bad',
            severity: 'bad',
            text_key: m === MODE_ANAEROBIC ? 'compost.perception.bad_anaerobic' : 'compost.perception.bad_aerobic',
            ratio: ratio
        };
    }

    function sampleOne(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)] || null;
    }

    function sampleAerobicStateEvent() {
        var eventId = sampleOne(aerobicStateEventIds);
        if (!eventId) return null;
        var evt = eventsById[eventId] || null;
        if (!evt) return null;
        var variant = sampleOne(evt.variants || []);
        return {
            event_id: eventId,
            stage: evt.stage || 'state',
            severity: evt.severity || 'info',
            best_action: String(evt.best_action || ''),
            secondary_action: String(evt.secondary_action || ''),
            bad_action: String(evt.bad_action || ''),
            variant: variant ? {
                text_variant_id: String(variant.text_variant_id || ''),
                title: String(variant.title || ''),
                desc: String(variant.desc || ''),
                success_text: String(variant.success_text || ''),
                fail_text: String(variant.fail_text || '')
            } : null
        };
    }

    function sampleAnaerobicVentEvent(index) {
        if (!Array.isArray(anaerobicVentEventIds) || anaerobicVentEventIds.length <= 0) return null;
        var idx = Math.max(0, Math.floor(Number(index) || 0));
        var eventId = anaerobicVentEventIds[idx] || anaerobicVentEventIds[anaerobicVentEventIds.length - 1] || '';
        if (!eventId) return null;
        var evt = eventsById[eventId] || null;
        if (!evt) return null;
        var variant = sampleOne(evt.variants || []);
        return {
            event_id: eventId,
            stage: evt.stage || 'state',
            severity: evt.severity || 'info',
            best_action: String(evt.best_action || ''),
            secondary_action: String(evt.secondary_action || ''),
            bad_action: String(evt.bad_action || ''),
            variant: variant ? {
                text_variant_id: String(variant.text_variant_id || ''),
                title: String(variant.title || ''),
                desc: String(variant.desc || ''),
                success_text: String(variant.success_text || ''),
                fail_text: String(variant.fail_text || '')
            } : null
        };
    }

    function getStartBlockState(mode) {
        var b = state.batches[mode];
        if (!b) return { blocked: true, reason: 'invalid_mode', batch_status: null, has_pending_output: false };
        var hasPendingOutput = !!(b.status === STATUS_SETTLED && Array.isArray(b.results) && b.results.length > 0);
        if (b.status === STATUS_FERMENTING) {
            return { blocked: true, reason: 'already_fermenting', batch_status: b.status, has_pending_output: false };
        }
        if (hasPendingOutput) {
            return { blocked: true, reason: 'output_pending', batch_status: b.status, has_pending_output: true };
        }
        return { blocked: false, reason: 'ok', batch_status: b.status, has_pending_output: false };
    }

    function canStartNewBatch(mode) {
        return !getStartBlockState(mode).blocked;
    }

    function ensureWindowsForMode(mode) {
        var triggers = mode === MODE_ANAEROBIC ? ANAEROBIC_TRIGGERS : AEROBIC_TRIGGERS;
        var duration = getDurationForMode(mode);
        var out = [];
        for (var i = 0; i < triggers.length; i++) {
            var end = (i < triggers.length - 1) ? (triggers[i + 1] - 1) : (duration - 1);
            out.push({
                index: i,
                trigger_tick: triggers[i],
                window_start: triggers[i],
                window_end: end,
                resolved: false,
                miss: false,
                action_id: null,
                success: false,
                score_delta: 0,
                event: null
            });
        }
        return out;
    }

    function buildBatch(mode, payload) {
        var p = payload || {};
        var materials = Array.isArray(p.materials) ? p.materials.slice() : [];
        var c = Number(p.c_total);
        var n = Number(p.n_total);
        if (!isFinite(c)) c = 0;
        if (!isFinite(n)) n = 0;
        c = Math.floor(c);
        n = Math.floor(n);
        var legal = c > 0 && n > 0;
        var ratio = legal ? (c / n) : null;
        var baseTier = legal ? computeTierFromRatio(ratio) : null;
        var windows = legal ? ensureWindowsForMode(mode) : [];
        return {
            mode: mode,
            status: STATUS_FERMENTING,
            abortable: true,
            age_ticks: 0,
            duration_ticks: getDurationForMode(mode),
            materials: materials,
            inoculant_item_id: p.inoculant_item_id ? String(p.inoculant_item_id) : null,
            c_total: c,
            n_total: n,
            ratio: ratio,
            legal_cn: legal,
            base_tier: baseTier,
            final_tier: null,
            compost_ops_score: 0,
            windows: windows,
            pending_window_index: -1,
            results: [],
            settled_reason: null,
            pending_effects: []
        };
    }

    function settleBatch(mode, reason) {
        var b = state.batches[mode];
        if (!b || b.status !== STATUS_FERMENTING) return { ok: false, reason: 'not_fermenting' };

        // 结算前先把已过期但未处理的窗口记为 miss；不会回拨时间，只影响分数。
        resolveExpiredWindows(b, true);

        b.abortable = false;
        b.status = STATUS_SETTLED;
        b.settled_reason = reason ? String(reason) : 'duration_reached';

        if (!b.legal_cn) {
            b.final_tier = 'void';
            b.results = [{
                item_id: mode === MODE_AEROBIC ? cfg.aerobic_void_item_id : cfg.anaerobic_void_item_id,
                count: 1
            }];
            return { ok: true, batch: clone(b) };
        }

        b.final_tier = b.base_tier;
        if (mode === MODE_AEROBIC) {
            var score = Number(b.compost_ops_score) || 0;
            var shift = 0;
            if (score >= 2) shift = 1;
            else if (score <= -2) shift = -1;
            b.final_tier = clampTierByShift(b.base_tier, shift);
            b.results = [{ item_id: toAerobicItemId(b.final_tier), count: 1 }];
            return { ok: true, batch: clone(b) };
        }

        var itemId = toAnaerobicItemId(b.base_tier);
        var amount = rollInclusiveInt(2, 4);
        var succ = countAnaerobicWindowSuccess(b);
        if (succ <= 0) {
            amount = Math.max(1, Math.floor(amount / 2));
            var buffId = String(cfg.anaerobic_failure_buff_id || '').trim();
            if (buffId) {
                b.pending_effects.push({ type: 'apply_buff', buff_id: buffId });
                applyPendingEffects(b);
            }
        }
        b.results = [{ item_id: itemId, count: amount }];
        return { ok: true, batch: clone(b) };
    }

    function countAnaerobicWindowSuccess(batch) {
        var n = 0;
        var arr = Array.isArray(batch.windows) ? batch.windows : [];
        for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].success) n += 1;
        return n;
    }

    function toAerobicItemId(tier) {
        var t = normalizeTier(tier);
        if (t === 'high') return 'compost_matrix_grade_high';
        if (t === 'mid') return 'compost_matrix_grade_mid';
        return 'compost_matrix_grade_low';
    }

    function toAnaerobicItemId(tier) {
        var t = normalizeTier(tier);
        return (cfg.anaerobic_tier_item_ids && cfg.anaerobic_tier_item_ids[t]) || cfg.anaerobic_tier_item_ids.low;
    }

    function resolveExpiredWindows(batch, includeCurrentTick) {
        if (!batch || batch.status !== STATUS_FERMENTING || !Array.isArray(batch.windows)) return;
        var nowAge = Number(batch.age_ticks) || 0;
        for (var i = 0; i < batch.windows.length; i++) {
            var w = batch.windows[i];
            if (!w || w.resolved) continue;
            if (nowAge < w.window_start) continue;
            var expired = includeCurrentTick ? (nowAge > w.window_end) : (nowAge - 1 > w.window_end);
            if (!expired) continue;
            w.resolved = true;
            w.miss = true;
            w.success = false;
            w.score_delta = (batch.mode === MODE_AEROBIC) ? -1 : 0;
            if (batch.mode === MODE_AEROBIC) batch.compost_ops_score += -1;
            if (batch.pending_window_index === i) batch.pending_window_index = -1;
        }
    }

    function openCurrentWindowIfNeeded(batch) {
        if (!batch || batch.status !== STATUS_FERMENTING || !Array.isArray(batch.windows)) return;
        if (!batch.legal_cn) {
            batch.pending_window_index = -1;
            return;
        }
        if (batch.pending_window_index >= 0) return;
        var nowAge = Number(batch.age_ticks) || 0;
        for (var i = 0; i < batch.windows.length; i++) {
            var w = batch.windows[i];
            if (!w || w.resolved) continue;
            if (nowAge < w.window_start || nowAge > w.window_end) continue;
            if (!w.event) {
                if (batch.mode === MODE_AEROBIC) w.event = sampleAerobicStateEvent();
                else w.event = sampleAnaerobicVentEvent(i);
            }
            if (batch.mode === MODE_ANAEROBIC && !w.event) {
                w.event = {
                    event_id: 'anaerobic_vent_window_' + String(i + 1),
                    best_action: 'vent_gas',
                    secondary_action: 'none',
                    bad_action: 'leave_as_is',
                    variant: null
                };
            }
            batch.pending_window_index = i;
            return;
        }
    }

    function stepBatch(mode, ticks) {
        var b = state.batches[mode];
        if (!b || b.status !== STATUS_FERMENTING) return;
        var delta = Math.max(0, Math.floor(Number(ticks) || 0));
        if (delta <= 0) return;
        for (var i = 0; i < delta; i++) {
            b.age_ticks += 1;
            resolveExpiredWindows(b, false);
            openCurrentWindowIfNeeded(b);
            if (b.age_ticks >= b.duration_ticks) {
                b.age_ticks = b.duration_ticks;
                settleBatch(mode, 'duration_reached');
                return;
            }
        }
    }

    function advanceByTicks(deltaTicks) {
        var d = Math.max(0, Math.floor(Number(deltaTicks) || 0));
        if (d <= 0) return;
        stepBatch(MODE_AEROBIC, d);
        stepBatch(MODE_ANAEROBIC, d);
    }

    function onWorldTick() {
        advanceByTicks(1);
    }

    function startBatch(mode, payload) {
        if (mode !== MODE_AEROBIC && mode !== MODE_ANAEROBIC) {
            return { ok: false, reason: 'invalid_mode' };
        }
        var block = getStartBlockState(mode);
        if (block.blocked) return { ok: false, reason: block.reason || 'slot_not_ready' };
        var b = buildBatch(mode, payload);
        state.batches[mode] = b;
        runHook('on_batch_started', {
            mode: mode,
            batch: clone(b)
        });
        return { ok: true, batch: clone(b) };
    }

    function interact(mode, actionId, options) {
        options = options || {};
        var b = state.batches[mode];
        if (!b || b.status !== STATUS_FERMENTING) return { ok: false, reason: 'not_fermenting' };
        if (!b.legal_cn) return { ok: false, reason: 'illegal_cn_batch' };
        resolveExpiredWindows(b, true);
        openCurrentWindowIfNeeded(b);
        if (b.pending_window_index < 0) return { ok: false, reason: 'no_pending_window' };

        var idx = b.pending_window_index;
        var w = b.windows[idx];
        if (!w || w.resolved) return { ok: false, reason: 'window_unavailable' };

        var act = String(actionId || '').trim();
        if (!act) return { ok: false, reason: 'invalid_action' };

        var delta = 0;
        var success = false;
        if (mode === MODE_AEROBIC) {
            var evt = w.event || {};
            if (act === String(evt.best_action || '')) {
                delta = 1; success = true;
            } else if (act === String(evt.secondary_action || '')) {
                delta = 0; success = true;
            } else {
                delta = -1; success = false;
            }
            b.compost_ops_score += delta;
        } else {
            // 沤肥事件仅影响产量惩罚判定，不改分档。
            success = (act === 'vent_gas');
            delta = 0;
        }

        w.resolved = true;
        w.miss = false;
        w.action_id = act;
        w.success = success;
        w.score_delta = delta;
        b.pending_window_index = -1;

        if (options.advance_world_tick !== false && global.Survival && typeof global.Survival.advanceTick === 'function') {
            if (mode === MODE_AEROBIC && typeof global.Survival.consumeStamina === 'function') {
                global.Survival.consumeStamina(5);
            }
            global.Survival.advanceTick();
        }
        runHook('on_window_interacted', {
            mode: mode,
            action_id: act,
            success: success,
            score_delta: delta,
            window_index: idx,
            stamina_cost: mode === MODE_AEROBIC ? 5 : 0,
            tick_cost: 1,
            batch: clone(b)
        });
        return { ok: true, score_delta: delta, success: success, window_index: idx, batch: clone(b) };
    }

    function runHook(hookName, payload) {
        var fn = hooks[hookName];
        if (typeof fn !== 'function') return;
        try { fn(payload || {}); } catch (err) { /* ignore hook error */ }
    }

    function setHooks(nextHooks) {
        var h = nextHooks && typeof nextHooks === 'object' ? nextHooks : {};
        hooks.on_batch_started = (typeof h.on_batch_started === 'function') ? h.on_batch_started : null;
        hooks.on_window_interacted = (typeof h.on_window_interacted === 'function') ? h.on_window_interacted : null;
    }

    function getWindowInteractionState(mode) {
        var b = state.batches[mode];
        if (!b || b.status !== STATUS_FERMENTING) {
            return {
                can_interact: false,
                reason: 'not_fermenting',
                pending_window_index: -1,
                pending_window: null
            };
        }
        if (!b.legal_cn) {
            return {
                can_interact: false,
                reason: 'illegal_cn_batch',
                pending_window_index: -1,
                pending_window: null
            };
        }
        resolveExpiredWindows(b, true);
        openCurrentWindowIfNeeded(b);
        var idx = Number(b.pending_window_index);
        var w = (Array.isArray(b.windows) && idx >= 0) ? (b.windows[idx] || null) : null;
        if (!w || w.resolved) {
            return {
                can_interact: false,
                reason: 'no_pending_window',
                pending_window_index: -1,
                pending_window: null
            };
        }
        return {
            can_interact: true,
            reason: 'ok',
            pending_window_index: idx,
            pending_window: clone(w)
        };
    }

    function collect(mode, requestedCount) {
        var b = state.batches[mode];
        if (!b || b.status !== STATUS_SETTLED || !Array.isArray(b.results) || b.results.length === 0) {
            return { ok: false, reason: 'nothing_to_collect' };
        }
        var r = b.results[0];
        var left = Math.max(0, Math.floor(Number(r.count) || 0));
        if (left <= 0) return { ok: false, reason: 'nothing_to_collect' };
        var req = requestedCount == null ? left : Math.max(1, Math.floor(Number(requestedCount) || 1));
        var take = Math.min(left, req);
        r.count = left - take;
        if (r.count <= 0) b.results = [];
        return {
            ok: true,
            item_id: r.item_id,
            count: take,
            remaining_in_batch: b.results[0] ? b.results[0].count : 0,
            batch: clone(b)
        };
    }

    function discard(mode) {
        var b = state.batches[mode];
        if (!b) return { ok: false, reason: 'invalid_mode' };
        if (b.status !== STATUS_SETTLED) return { ok: false, reason: 'not_settled' };
        state.batches[mode] = createIdleBatch(mode);
        return { ok: true };
    }

    function abort(mode, reason) {
        var b = state.batches[mode];
        if (!b || b.status !== STATUS_FERMENTING) return { ok: false, reason: 'not_fermenting' };
        if (!b.abortable) return { ok: false, reason: 'not_abortable' };
        state.batches[mode] = createIdleBatch(mode);
        state.batches[mode].settled_reason = reason ? String(reason) : 'aborted';
        return { ok: true };
    }

    function forceTerminate(mode, reason) {
        var b = state.batches[mode];
        if (!b) return { ok: false, reason: 'invalid_mode' };
        if (b.status === STATUS_FERMENTING) return settleBatch(mode, reason || 'forced_terminate');
        if (b.status === STATUS_SETTLED) {
            b.settled_reason = reason ? String(reason) : b.settled_reason;
            return { ok: true, batch: clone(b) };
        }
        return { ok: false, reason: 'idle' };
    }

    function applyPendingEffects(batch) {
        if (!batch || !Array.isArray(batch.pending_effects) || batch.pending_effects.length === 0) return;
        var rest = [];
        for (var i = 0; i < batch.pending_effects.length; i++) {
            var e = batch.pending_effects[i];
            if (!e || e.type !== 'apply_buff') continue;
            var bid = String(e.buff_id || '').trim();
            if (!bid) continue;
            if (global.BuffSystem && typeof global.BuffSystem.applyBuff === 'function') {
                try { global.BuffSystem.applyBuff('player', bid, 'compost_system', { tags: ['compost', 'anaerobic'] }); } catch (err) { rest.push(e); }
            } else {
                rest.push(e);
            }
        }
        batch.pending_effects = rest;
    }

    function setConfig(nextCfg) {
        var c = nextCfg || {};
        if (c.aerobic_duration_ticks != null) cfg.aerobic_duration_ticks = Math.max(1, Math.floor(Number(c.aerobic_duration_ticks) || cfg.aerobic_duration_ticks));
        if (c.anaerobic_duration_ticks != null) cfg.anaerobic_duration_ticks = Math.max(1, Math.floor(Number(c.anaerobic_duration_ticks) || cfg.anaerobic_duration_ticks));
        if (c.aerobic_void_item_id) cfg.aerobic_void_item_id = String(c.aerobic_void_item_id);
        if (c.anaerobic_void_item_id) cfg.anaerobic_void_item_id = String(c.anaerobic_void_item_id);
        if (c.anaerobic_failure_buff_id != null) cfg.anaerobic_failure_buff_id = String(c.anaerobic_failure_buff_id);
        if (c.anaerobic_tier_item_ids && typeof c.anaerobic_tier_item_ids === 'object') {
            cfg.anaerobic_tier_item_ids = {
                low: c.anaerobic_tier_item_ids.low ? String(c.anaerobic_tier_item_ids.low) : cfg.anaerobic_tier_item_ids.low,
                mid: c.anaerobic_tier_item_ids.mid ? String(c.anaerobic_tier_item_ids.mid) : cfg.anaerobic_tier_item_ids.mid,
                high: c.anaerobic_tier_item_ids.high ? String(c.anaerobic_tier_item_ids.high) : cfg.anaerobic_tier_item_ids.high
            };
        }
    }

    function setEventsTable(json) {
        eventsById = {};
        aerobicStateEventIds = [];
        anaerobicVentEventIds = [];
        var root = json && json.events && typeof json.events === 'object' ? json.events : {};
        for (var id in root) {
            if (!Object.prototype.hasOwnProperty.call(root, id)) continue;
            var evt = root[id];
            if (!evt || typeof evt !== 'object') continue;
            eventsById[id] = evt;
            if (evt.enabled === true && String(evt.stage || '') === 'state') {
                var sid = String(id);
                if (/^anaerobic_vent_window_\d+$/.test(sid)) anaerobicVentEventIds.push(sid);
                else aerobicStateEventIds.push(sid);
            }
        }
        anaerobicVentEventIds.sort(function (a, b) { return a.localeCompare(b); });
    }

    function getBatch(mode) {
        return clone(state.batches[mode] || null);
    }

    function getState() {
        return clone(state);
    }

    function setState(next) {
        var src = next && next.batches && typeof next.batches === 'object' ? next.batches : {};
        state.batches.aerobic = normalizeLoadedBatch(src.aerobic, MODE_AEROBIC);
        state.batches.anaerobic = normalizeLoadedBatch(src.anaerobic, MODE_ANAEROBIC);
        applyPendingEffects(state.batches.aerobic);
        applyPendingEffects(state.batches.anaerobic);
    }

    function normalizeLoadedBatch(raw, mode) {
        if (!raw || typeof raw !== 'object') return createIdleBatch(mode);
        var idle = createIdleBatch(mode);
        idle.status = (raw.status === STATUS_IDLE || raw.status === STATUS_FERMENTING || raw.status === STATUS_SETTLED) ? raw.status : STATUS_IDLE;
        idle.abortable = !!raw.abortable;
        idle.age_ticks = Math.max(0, Math.floor(Number(raw.age_ticks) || 0));
        idle.duration_ticks = Math.max(1, Math.floor(Number(raw.duration_ticks) || getDurationForMode(mode)));
        idle.materials = Array.isArray(raw.materials) ? raw.materials.slice() : [];
        idle.inoculant_item_id = raw.inoculant_item_id ? String(raw.inoculant_item_id) : null;
        idle.c_total = Math.floor(Number(raw.c_total) || 0);
        idle.n_total = Math.floor(Number(raw.n_total) || 0);
        idle.ratio = (raw.ratio == null || !isFinite(Number(raw.ratio))) ? null : Number(raw.ratio);
        idle.legal_cn = !!raw.legal_cn;
        idle.base_tier = raw.base_tier ? normalizeTier(raw.base_tier) : null;
        idle.final_tier = raw.final_tier ? String(raw.final_tier) : null;
        idle.compost_ops_score = Math.floor(Number(raw.compost_ops_score) || 0);
        idle.windows = Array.isArray(raw.windows) ? raw.windows : ensureWindowsForMode(mode);
        idle.pending_window_index = Number(raw.pending_window_index);
        if (!isFinite(idle.pending_window_index)) idle.pending_window_index = -1;
        idle.results = Array.isArray(raw.results) ? raw.results.map(function (r) {
            return { item_id: String(r && r.item_id || ''), count: Math.max(0, Math.floor(Number(r && r.count) || 0)) };
        }).filter(function (r2) { return r2.item_id && r2.count > 0; }) : [];
        idle.settled_reason = raw.settled_reason != null ? String(raw.settled_reason) : null;
        idle.pending_effects = Array.isArray(raw.pending_effects) ? raw.pending_effects.slice() : [];
        return idle;
    }

    function clone(v) {
        return JSON.parse(JSON.stringify(v));
    }

    global.CompostSystem = {
        STATUS_IDLE: STATUS_IDLE,
        STATUS_FERMENTING: STATUS_FERMENTING,
        STATUS_SETTLED: STATUS_SETTLED,
        MODE_AEROBIC: MODE_AEROBIC,
        MODE_ANAEROBIC: MODE_ANAEROBIC,
        // 关键状态字段说明：
        // - age_ticks/duration_ticks: 批次已发酵时长与总时长，独立于互动是否处理。
        // - windows[]: 每个事件窗的触发区间、动作与是否 miss。
        // - compost_ops_score: 仅好氧使用，miss/坏操作只扣分，不回拨时间。
        // - legal_cn=false: 非法 C/N 批次，直接废档结算，跳过互动分档逻辑。
        setConfig: setConfig,
        setHooks: setHooks,
        setEventsTable: setEventsTable,
        getState: getState,
        setState: setState,
        getBatch: getBatch,
        getStartBlockState: getStartBlockState,
        canStartNewBatch: canStartNewBatch,
        startBatch: startBatch,
        onWorldTick: onWorldTick,
        advanceByTicks: advanceByTicks,
        getWindowInteractionState: getWindowInteractionState,
        interact: interact,
        settleBatch: settleBatch,
        collect: collect,
        discard: discard,
        abort: abort,
        forceTerminate: forceTerminate,
        isTemplateEligibleMainMaterial: isTemplateEligibleMainMaterial,
        isTemplateEligibleInoculant: isTemplateEligibleInoculant,
        computeCnTotalsFromInputItems: computeCnTotalsFromInputItems,
        classifyCnFeedbackByTotals: classifyCnFeedbackByTotals
    };
})(typeof window !== 'undefined' ? window : this);

