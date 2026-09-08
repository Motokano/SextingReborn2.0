/**
 * PharmacyCompounding — 配药模式规则（47 §9，k231）
 *
 * 职责（纯规则 + 结算，不含 UI）：
 *   - 分类成分：溶媒（底液，不占浓度）/ 药成分（toxicity>0）/ 辅成分（toxicity<0，抵消）/ 功能成分（toxicity=0）/ 助剂。
 *   - 浓度预算：Σ concentration_cost × 份数 ≤ concentration_capacity（§9.3）。
 *   - 净药效：按药效族求和 → potency 档 → 注射液 buff（buff_pharm_<family>_inject_<potency>，§9.2/§3.3）。
 *   - 净毒性：Σ(主药毒性×份数) × (1 − 抵消率)，抵消率封顶（残毒 ≥10%，§9.2）。
 *   - 相冲：类别级两两比对（data/pharmacy-conflict-rules.json），注射后结算（§10）。
 *   - 产出：动态注射液实例 { item_id, count, components[] }（§9.4）。
 *
 * 依赖：InventoryEquipment.getItemTemplate / BuffSystem / PharmacyEffects（调用期解析）。
 */
(function (global) {
    'use strict';

    var DEFAULT_CAPACITY = 100;
    var DEFAULT_POTENCY_THRESHOLDS = [33, 66];
    var DEFAULT_OFFSET_CAP = 0.9;
    var DEFAULT_SYNERGY_BONUS = 0.2;

    /** 配药台可投料的成分 sub_category。 */
    var COMPONENT_SUB_CATEGORIES = ['pharm_powder', 'solvent', 'pharm_adjuvant'];

    var cfg = {
        capacity: DEFAULT_CAPACITY,
        potency_thresholds: DEFAULT_POTENCY_THRESHOLDS.slice(),
        offset_rate_cap: DEFAULT_OFFSET_CAP,
        synergy_bonus_per_unit: DEFAULT_SYNERGY_BONUS,
        injectable_template_id: 'potion_compound_injection'
    };
    var conflictRules = { outcome_buffs: {}, rules: [], skip: { missing_chem_class: true, toxicity_zero: true, sub_categories: ['solvent', 'pharm_adjuvant'] } };

    function num(v, fallback) {
        var n = Number(v);
        return isFinite(n) ? n : fallback;
    }

    function setConfig(systemConfig, rules) {
        var p = systemConfig && typeof systemConfig === 'object' ? systemConfig : {};
        cfg.capacity = Math.max(1, num(p.pharmacy_concentration_capacity, cfg.capacity));
        if (Array.isArray(p.pharmacy_potency_thresholds) && p.pharmacy_potency_thresholds.length >= 2) {
            cfg.potency_thresholds = p.pharmacy_potency_thresholds.slice(0, 2).map(function (v) { return num(v, 0); });
        }
        cfg.offset_rate_cap = Math.max(0, Math.min(1, num(p.pharmacy_offset_rate_cap, cfg.offset_rate_cap)));
        cfg.synergy_bonus_per_unit = Math.max(0, num(p.pharmacy_synergy_bonus_per_unit, cfg.synergy_bonus_per_unit));
        if (p.pharmacy_injectable_template_id) cfg.injectable_template_id = String(p.pharmacy_injectable_template_id);
        if (rules && typeof rules === 'object') {
            conflictRules = {
                outcome_buffs: rules.outcome_buffs && typeof rules.outcome_buffs === 'object' ? rules.outcome_buffs : {},
                rules: Array.isArray(rules.rules) ? rules.rules : [],
                skip: rules.skip && typeof rules.skip === 'object' ? rules.skip : conflictRules.skip
            };
        }
        return getConfig();
    }

    function getConfig() {
        return {
            capacity: cfg.capacity,
            potency_thresholds: cfg.potency_thresholds.slice(),
            offset_rate_cap: cfg.offset_rate_cap,
            synergy_bonus_per_unit: cfg.synergy_bonus_per_unit,
            injectable_template_id: cfg.injectable_template_id
        };
    }

    function getTemplate(itemId) {
        var IE = global.InventoryEquipment;
        if (IE && typeof IE.getItemTemplate === 'function') return IE.getItemTemplate(itemId);
        return null;
    }

    /** 模板是否是配药可用成分（药粉/溶媒/助剂）。 */
    function isComponentTemplate(tpl) {
        if (!tpl) return false;
        var sub = String(tpl.sub_category || '').trim().toLowerCase();
        return COMPONENT_SUB_CATEGORIES.indexOf(sub) >= 0;
    }

    /** 成分角色：solvent / drug / offset / functional / adjuvant / unknown。 */
    function classifyTemplate(tpl) {
        if (!tpl) return 'unknown';
        var sub = String(tpl.sub_category || '').trim().toLowerCase();
        if (sub === 'solvent') return 'solvent';
        if (sub === 'pharm_adjuvant') return 'adjuvant';
        if (sub !== 'pharm_powder') return 'unknown';
        var tox = num(tpl.pharm_toxicity, 0);
        if (tox > 0) return 'drug';
        if (tox < 0) return 'offset';
        return 'functional';
    }

    function classifyItem(itemId) {
        return classifyTemplate(getTemplate(itemId));
    }

    /** 浓度占用（溶媒底液不占，§9.1）。 */
    function getConcentrationCost(tpl, count) {
        if (!tpl) return 0;
        if (classifyTemplate(tpl) === 'solvent') return 0;
        return Math.max(0, num(tpl.concentration_cost, 0)) * Math.max(1, Math.floor(num(count, 1)));
    }

    function normalizeInputs(inputs) {
        var byId = {};
        var order = [];
        (Array.isArray(inputs) ? inputs : []).forEach(function (row) {
            if (!row) return;
            var id = row.item_id != null ? String(row.item_id).trim() : '';
            if (!id) return;
            var c = Math.max(1, Math.floor(num(row.count, 1)));
            if (!byId[id]) { byId[id] = 0; order.push(id); }
            byId[id] += c;
        });
        return order.map(function (id) { return { item_id: id, count: byId[id] }; });
    }

    /** 校验投料是否可配药（§9.1/§9.3/§9.4）。 */
    function validate(inputs) {
        var list = normalizeInputs(inputs);
        if (!list.length) return { ok: false, reason: 'empty_inputs' };

        var solventCount = 0;
        var used = 0;
        var i;
        for (i = 0; i < list.length; i++) {
            var tpl = getTemplate(list[i].item_id);
            if (!tpl) return { ok: false, reason: 'item_not_found', item_id: list[i].item_id };
            var role = classifyTemplate(tpl);
            if (role === 'unknown') return { ok: false, reason: 'not_compound_component', item_id: list[i].item_id };
            if (role === 'solvent') { solventCount += list[i].count; continue; }
            used += getConcentrationCost(tpl, list[i].count);
        }
        if (solventCount <= 0) return { ok: false, reason: 'solvent_required' };
        if (solventCount > 1) return { ok: false, reason: 'too_many_solvent', count: solventCount };
        if (used > cfg.capacity) return { ok: false, reason: 'over_capacity', used: used, capacity: cfg.capacity };
        return { ok: true, concentration_used: used, capacity: cfg.capacity, components: list };
    }

    /** 相冲豁免判定（§9.1 助剂成盐助溶 / 溶媒底液 / 功能成分无副作用）。 */
    function isConflictExempt(tpl) {
        if (!tpl) return true;
        var skip = conflictRules.skip || {};
        var sub = String(tpl.sub_category || '').trim().toLowerCase();
        if (Array.isArray(skip.sub_categories) && skip.sub_categories.indexOf(sub) >= 0) return true;
        if (skip.toxicity_zero && num(tpl.pharm_toxicity, 0) === 0) return true;
        if (skip.missing_chem_class && !String(tpl.chem_class || '').trim()) return true;
        return false;
    }

    /** 相冲结算（类别级两两比对；返回命中规则列表）。 */
    function resolveConflicts(components) {
        var judged = [];
        (components || []).forEach(function (row) {
            var tpl = getTemplate(row.item_id);
            if (!tpl || isConflictExempt(tpl)) return;
            var cls = String(tpl.chem_class || '').trim().toLowerCase();
            if (!cls) return;
            judged.push({ item_id: row.item_id, chem_class: cls });
        });
        var hits = [];
        var i, j, k;
        for (i = 0; i < judged.length; i++) {
            for (j = i + 1; j < judged.length; j++) {
                for (k = 0; k < conflictRules.rules.length; k++) {
                    var rule = conflictRules.rules[k] || {};
                    var classes = Array.isArray(rule.chem_classes) ? rule.chem_classes.map(function (c) { return String(c).trim().toLowerCase(); }) : [];
                    if (classes.length !== 2) continue;
                    var a = judged[i].chem_class;
                    var b = judged[j].chem_class;
                    var matched = (classes[0] === a && classes[1] === b) || (classes[0] === b && classes[1] === a);
                    if (!matched) continue;
                    hits.push({
                        rule_id: rule.rule_id || '',
                        chem_classes: classes.slice(),
                        outcome: String(rule.outcome || ''),
                        buff_id: (conflictRules.outcome_buffs || {})[String(rule.outcome || '')] || '',
                        items: [judged[i].item_id, judged[j].item_id],
                        desc: rule.desc || ''
                    });
                }
            }
        }
        return hits;
    }

    /** 净药效 → 族 → potency 档 → 注射液 buff id。 */
    function resolveFamilies(components) {
        var effectByFamily = {};
        var synergyUnits = 0;
        var i;
        for (i = 0; i < components.length; i++) {
            var tpl = getTemplate(components[i].item_id);
            if (!tpl) continue;
            var family = String(tpl.pharm_family || '').trim().toLowerCase();
            var effect = num(tpl.pharm_effect, 0);
            if (!family) continue;
            // 增效成分本身 effect=0（47 §9.7 辅成分表），只放大同针其它族
            if (family === 'synergist') { synergyUnits += components[i].count; continue; }
            if (!(effect > 0)) continue;
            effectByFamily[family] = (effectByFamily[family] || 0) + effect * components[i].count;
        }
        var synergyMul = 1 + cfg.synergy_bonus_per_unit * synergyUnits;
        var out = [];
        var fams = Object.keys(effectByFamily);
        for (i = 0; i < fams.length; i++) {
            var raw = effectByFamily[fams[i]] * synergyMul;
            var band = raw <= cfg.potency_thresholds[0] ? 'weak' : (raw <= cfg.potency_thresholds[1] ? 'regular' : 'potent');
            out.push({
                family: fams[i],
                effect: Math.round(raw * 100) / 100,
                potency: band,
                buff_id: 'buff_pharm_' + fams[i] + '_inject_' + band
            });
        }
        return { families: out, synergy_multiplier: synergyMul, synergy_units: synergyUnits };
    }

    /**
     * 配药结算（§9.2）：净毒性 = Σ(主药毒性×份数) × (1 − 抵消率)，抵消率封顶。
     * 返回 { ok, families, buff_ids, base_toxicity, offset_rate, net_toxicity, conflicts, addiction_components, concentration_used, capacity, components }
     */
    function resolve(inputs) {
        var check = validate(inputs);
        if (!check.ok) return check;
        var components = check.components;

        var baseTox = 0;
        var offsetPool = 0;
        var addictionComponents = 0;
        var i;
        for (i = 0; i < components.length; i++) {
            var tpl = getTemplate(components[i].item_id);
            if (!tpl) continue;
            var role = classifyTemplate(tpl);
            var tox = num(tpl.pharm_toxicity, 0);
            if (role === 'drug' || tox > 0) {
                baseTox += tox * components[i].count;
                addictionComponents += components[i].count;
            } else if (tox < 0) {
                offsetPool += Math.abs(tox) * components[i].count;
            }
        }
        var offsetRate = 0;
        if (baseTox > 0 && offsetPool > 0) {
            offsetRate = Math.min(cfg.offset_rate_cap, offsetPool / baseTox);
        }
        var netTox = Math.max(0, baseTox * (1 - offsetRate));

        var fam = resolveFamilies(components);
        return {
            ok: true,
            components: components,
            concentration_used: check.concentration_used,
            capacity: check.capacity,
            families: fam.families,
            synergy_multiplier: fam.synergy_multiplier,
            synergy_units: fam.synergy_units,
            buff_ids: fam.families.map(function (f) { return f.buff_id; }),
            base_toxicity: Math.round(baseTox * 100) / 100,
            offset_rate: Math.round(offsetRate * 1000) / 1000,
            net_toxicity: Math.round(netTox * 100) / 100,
            conflicts: resolveConflicts(components),
            addiction_components: addictionComponents
        };
    }

    /** 产出动态注射液实例（§9.4：components 列表随实例走）。 */
    function buildInstance(inputs, options) {
        var res = resolve(inputs);
        if (!res.ok) return res;
        var opts = options && typeof options === 'object' ? options : {};
        var templateId = opts.template_id ? String(opts.template_id) : cfg.injectable_template_id;
        return {
            ok: true,
            instance: {
                item_id: templateId,
                count: 1,
                components: res.components.map(function (c) { return { item_id: c.item_id, count: c.count }; })
            },
            resolved: res
        };
    }

    /** 读实例成分 → 结算（注射/UI 用；实例无 components 时按空处理）。 */
    function resolveInstance(instance) {
        var comps = instance && Array.isArray(instance.components) ? instance.components : [];
        if (!comps.length) return { ok: false, reason: 'no_components' };
        return resolve(comps);
    }

    /**
     * 注射后结算（§9.2/§10/§4.1）：挂各家族 buff、注入净毒性、相冲结局 buff、按成分累加成瘾。
     * 返回 { ok, buff_ids, applied_buffs, toxicity_added, conflict_buffs, addiction_components, resolved }
     */
    function applyInjection(instance, options) {
        var res = resolveInstance(instance);
        if (!res.ok) return res;
        var opts = options && typeof options === 'object' ? options : {};
        var BS = global.BuffSystem;
        var PE = global.PharmacyEffects;
        var applied = [];
        var i;
        if (BS && typeof BS.applyBuff === 'function') {
            for (i = 0; i < res.buff_ids.length; i++) {
                var bid = res.buff_ids[i];
                if (typeof BS.hasBuffByBuffId === 'function' && BS.hasBuffByBuffId('player', bid)) continue;
                if (BS.applyBuff('player', bid, 'pharmacy:compound', { route: 'inject' })) applied.push(bid);
            }
        }
        var conflictBuffs = [];
        if (BS && typeof BS.applyBuff === 'function') {
            for (i = 0; i < res.conflicts.length; i++) {
                var cid = res.conflicts[i].buff_id;
                if (!cid) continue;
                if (BS.applyBuff('player', cid, 'pharmacy:conflict', { route: 'inject' })) conflictBuffs.push(cid);
            }
        }
        var toxicityAdded = 0;
        if (res.net_toxicity > 0 && PE && typeof PE.addToxicity === 'function') {
            toxicityAdded = PE.addToxicity(res.net_toxicity);
        }
        if (res.addiction_components > 0 && PE && typeof PE.addAddictionFromRoute === 'function') {
            PE.addAddictionFromRoute('inject', res.addiction_components);
        }
        if (!opts.skip_history) recordHistory(res);
        return {
            ok: true,
            resolved: res,
            buff_ids: res.buff_ids,
            applied_buffs: applied,
            conflict_buffs: conflictBuffs,
            toxicity_added: toxicityAdded,
            addiction_components: res.addiction_components
        };
    }

    /** 配药历史（图鉴/统计：§8 待定的「联合注射液图鉴写法」先记成分组合）。 */
    function historyKey(components) {
        return components.map(function (c) { return String(c.item_id) + 'x' + String(c.count); }).sort().join('+');
    }

    function recordHistory(res) {
        if (!global.SceneCtx || !res || !res.ok) return;
        global.SceneCtx.pharmacy_compound_history = global.SceneCtx.pharmacy_compound_history || {};
        var key = historyKey(res.components);
        var ent = global.SceneCtx.pharmacy_compound_history[key] || { count: 0, families: [], net_toxicity: 0, conflicts: 0 };
        ent.count += 1;
        ent.families = res.families.map(function (f) { return f.family + ':' + f.potency; });
        ent.net_toxicity = res.net_toxicity;
        ent.conflicts = res.conflicts.length;
        global.SceneCtx.pharmacy_compound_history[key] = ent;
    }

    function getHistory() {
        return (global.SceneCtx && global.SceneCtx.pharmacy_compound_history) ? global.SceneCtx.pharmacy_compound_history : {};
    }

    /** 浓度条数据（面板 UI 用）。 */
    function getConcentrationInfo(inputs) {
        var list = normalizeInputs(inputs);
        var used = 0;
        var solvent = 0;
        list.forEach(function (row) {
            var tpl = getTemplate(row.item_id);
            if (!tpl) return;
            if (classifyTemplate(tpl) === 'solvent') { solvent += row.count; return; }
            used += getConcentrationCost(tpl, row.count);
        });
        return { used: used, capacity: cfg.capacity, ratio: cfg.capacity > 0 ? Math.min(1, used / cfg.capacity) : 0, solvent_count: solvent };
    }

    var api = {
        setConfig: setConfig,
        getConfig: getConfig,
        classifyTemplate: classifyTemplate,
        classifyItem: classifyItem,
        isComponentTemplate: isComponentTemplate,
        getConcentrationCost: getConcentrationCost,
        getConcentrationInfo: getConcentrationInfo,
        normalizeInputs: normalizeInputs,
        validate: validate,
        resolve: resolve,
        resolveInstance: resolveInstance,
        buildInstance: buildInstance,
        resolveConflicts: resolveConflicts,
        applyInjection: applyInjection,
        historyKey: historyKey,
        getHistory: getHistory
    };

    global.PharmacyCompounding = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
