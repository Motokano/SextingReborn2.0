(function (global) {
    'use strict';

    var blocks = {};
    var fields = {};
    var renderers = {};

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function setTable(json) {
        blocks = {};
        fields = {};
        renderers = {};
        if (!json || typeof json !== 'object') return;
        if (json.blocks && typeof json.blocks === 'object') blocks = json.blocks;
        if (json.fields && typeof json.fields === 'object') fields = json.fields;
        if (json.renderers && typeof json.renderers === 'object') renderers = json.renderers;
    }

    function getFieldRule(field) {
        var k = String(field || '').trim();
        if (!k) return null;
        return fields[k] && typeof fields[k] === 'object' ? fields[k] : null;
    }

    function getBlocks() {
        return blocks;
    }

    function getSkillLevel(character, skillId) {
        if (!character || !character.skills || !skillId) return 0;
        var rec = character.skills[skillId];
        var lv = rec && rec.level != null ? parseInt(rec.level, 10) : 0;
        return isFinite(lv) && lv > 0 ? lv : 0;
    }

    function getNestedValue(obj, dotPath) {
        if (!obj || !dotPath) return undefined;
        var parts = String(dotPath).split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function isEmptyValue(v) {
        if (v === null || v === undefined) return true;
        if (typeof v === 'string' && String(v).trim() === '') return true;
        return false;
    }

    function isFieldVisible(rule, character) {
        if (!rule || typeof rule !== 'object') return false;
        var ren = String(rule.renderer || '').trim();
        if (ren === 'hidden') return false;
        var fieldKey = String(rule._fieldKey != null ? rule._fieldKey : '').trim();
        if (fieldKey.indexOf('use_effect.') === 0) return false;
        if (ren === 'language_gated_name' || ren === 'language_gated_desc') return false;
        var bid = String(rule.primary_block || '').trim();
        var blk = bid && blocks[bid] ? blocks[bid] : null;
        var sid = rule.skill_id != null && rule.skill_id !== '' ? String(rule.skill_id).trim() : '';
        if (!sid) {
            if (!blk || blk.default_visible !== true) return false;
        }
        return true;
    }

    function skillUnlocked(rule, character) {
        var sid = rule.skill_id != null && rule.skill_id !== '' ? String(rule.skill_id).trim() : '';
        if (!sid) return true;
        var need = Math.max(0, parseInt(rule.level_min, 10) || 0);
        return getSkillLevel(character, sid) >= need;
    }

    /** 技能显示名：生存技能表 → 战斗技能表 → 生活技能 ui 键（life.skill.xxx.name）→ 原始 id */
    function getSkillDisplayName(skillId) {
        var sid = String(skillId || '').trim();
        if (!sid) return sid;
        try {
            if (global.SurvivalSkills && typeof global.SurvivalSkills.getById === 'function') {
                var s1 = global.SurvivalSkills.getById(sid);
                if (s1 && s1.name) return String(s1.name);
            }
        } catch (e1) { /* ignore */ }
        try {
            if (global.CombatSkills && typeof global.CombatSkills.getSkill === 'function') {
                var s2 = global.CombatSkills.getSkill(sid);
                if (s2 && s2.name) return String(s2.name);
            }
        } catch (e2) { /* ignore */ }
        if (sid.indexOf('life_') === 0) {
            var lifeName = safeT('life.skill.' + sid.slice(5) + '.name', {});
            if (lifeName && lifeName.indexOf('life.skill.') !== 0) return lifeName;
        }
        return sid;
    }

    /** 与 ItemInfoModules 一致的锁定要求行文案（item_info.locked_hint + tooltip-module-req 样式） */
    function buildLockedReqHtml(rule, character) {
        var sid = rule.skill_id != null && rule.skill_id !== '' ? String(rule.skill_id).trim() : '';
        if (!sid) return '';
        var need = Math.max(0, parseInt(rule.level_min, 10) || 0);
        var cur = getSkillLevel(character, sid);
        var remain = Math.max(0, need - cur);
        var reqLine = safeT('item_info.locked_hint', {
            skillId: getSkillDisplayName(sid),
            level: need,
            need: remain
        });
        return '<span class="tooltip-module-req">' + esc(reqLine) + '</span>';
    }

    function safeT(key, vars) {
        try {
            if (global.UIText && typeof global.UIText.t === 'function') return global.UIText.t(key, vars);
        } catch (e) { /* ignore */ }
        return esc(key);
    }

    function fieldLabel(fieldKey) {
        var uiKey = 'item.field.' + String(fieldKey || '').replace(/\./g, '_');
        return safeT(uiKey, {});
    }

    function formatBoolTag(val) {
        var b = val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true';
        return b ? safeT('item.bool.yes', {}) : safeT('item.bool.no', {});
    }

    function formatNumber(val) {
        var n = Number(val);
        if (!isFinite(n)) return esc(String(val));
        if (Math.abs(n - Math.round(n)) < 1e-9) return esc(String(Math.round(n)));
        return esc(String(n));
    }

    function formatTicks(n) {
        var t = Math.max(0, Math.floor(Number(n) || 0));
        return safeT('item.field.duration_ticks', { n: t });
    }

    function renderBuffSummary(buffId, buffLookup) {
        var id = String(buffId || '').trim();
        if (!id) return '';
        var name = '';
        if (typeof buffLookup === 'function') {
            try {
                var info = buffLookup(id);
                if (info && typeof info === 'object' && info.name) name = String(info.name).trim();
            } catch (e) { /* ignore */ }
        }
        if (name) return esc(name) + ' <span class="tooltip-field-buff-id">(' + esc(id) + ')</span>';
        return safeT('item.field.buff_summary_fallback', { id: esc(id) });
    }

    /** 食物恢复摘要（k35，43 消化模型）：buff 的 survival_delta（每 tick）× durationTicks → 恢复总量 */
    function renderFoodRestore(buffId, buffLookup) {
        var id = String(buffId || '').trim();
        if (!id) return '';
        var info = null;
        if (typeof buffLookup === 'function') {
            try { info = buffLookup(id); } catch (e) { /* ignore */ }
        }
        var sd = info && info.survivalDelta;
        var dur = info && info.durationTicks > 0 ? info.durationTicks : 1;
        var parts = [];
        if (sd) {
            function round1(v) { return Math.round(v * 10) / 10; }
            if (sd.satiety) parts.push(safeT('item.food.restore.satiety', { v: round1(sd.satiety * dur) }));
            if (sd.thirst) parts.push(safeT('item.food.restore.thirst', { v: round1(sd.thirst * dur) }));
            if (sd.nutrition) parts.push(safeT('item.food.restore.nutrition', { v: round1(sd.nutrition * dur) }));
        }
        var name = info && info.name ? String(info.name).trim() : '';
        if (!parts.length) {
            if (name) return esc(name) + ' <span class="tooltip-field-buff-id">(' + esc(id) + ')</span>';
            return safeT('item.field.buff_summary_fallback', { id: esc(id) });
        }
        return (name ? esc(name) + '：' : '') + parts.join(' · ');
    }

    function renderValueHtml(rule, rawVal, buffLookup) {
        var ren = String(rule.renderer || '').trim();
        if (ren === 'raw_text') return '<span class="tooltip-module-v">' + esc(rawVal) + '</span>';
        if (ren === 'bool_tag') return '<span class="tooltip-module-v">' + formatBoolTag(rawVal) + '</span>';
        if (ren === 'number') return '<span class="tooltip-module-v">' + formatNumber(rawVal) + '</span>';
        if (ren === 'tick_duration') return '<span class="tooltip-module-v">' + formatTicks(rawVal) + '</span>';
        if (ren === 'buff_summary') return '<span class="tooltip-module-v">' + renderBuffSummary(rawVal, buffLookup) + '</span>';
        if (ren === 'food_restore') return '<span class="tooltip-module-v">' + renderFoodRestore(rawVal, buffLookup) + '</span>';
        return '';
    }

    function collectRows(tpl, inst, character, buffLookup) {
        var byBlock = {};
        var fk;
        for (fk in fields) {
            if (!fields.hasOwnProperty(fk)) continue;
            var baseRule = fields[fk];
            if (!baseRule || typeof baseRule !== 'object') continue;
            var rule = Object.assign({}, baseRule, { _fieldKey: fk });
            if (!isFieldVisible(rule, character)) continue;
            var rawVal = getNestedValue(tpl, fk);
            if (rawVal === undefined && inst) rawVal = getNestedValue(inst, fk);
            var unlocked = skillUnlocked(rule, character);
            if (unlocked) {
                if (isEmptyValue(rawVal)) {
                    if (rawVal !== false && rawVal !== 0) continue;
                }
            } else {
                var hint = String(rule.locked_hint || '').trim();
                if (!hint) continue;
            }
            var bid = String(rule.primary_block || 'misc') || 'misc';
            if (!byBlock[bid]) byBlock[bid] = [];
            byBlock[bid].push({ fieldKey: fk, rule: rule, rawVal: rawVal, unlocked: unlocked });
        }
        var b;
        for (b in byBlock) {
            if (!byBlock.hasOwnProperty(b)) continue;
            byBlock[b].sort(function (a, c) {
                return String(a.fieldKey).localeCompare(String(c.fieldKey));
            });
        }
        return byBlock;
    }

    function renderFieldBlocksHtml(args) {
        try {
            var tpl = args && args.tpl;
            var inst = args && args.inst;
            var character = args && args.character;
            var buffLookup = args && args.buffLookup;
            if (!tpl || typeof tpl !== 'object') return '';
            if (!Object.keys(fields).length) return '';
            var byBlock = collectRows(tpl, inst, character, buffLookup);
            var blockIds = Object.keys(byBlock).filter(function (bid) {
                return byBlock[bid] && byBlock[bid].length;
            });
            if (!blockIds.length) return '';
            blockIds.sort(function (a, b) {
                if (a === 'regular') return -1;
                if (b === 'regular') return 1;
                return String(a).localeCompare(String(b));
            });
            var html = '<div class="tooltip-modules tooltip-field-rules">';
            var bi;
            for (bi = 0; bi < blockIds.length; bi++) {
                var bid = blockIds[bi];
                var blk = blocks[bid] || {};
                var btitle = String(blk.display_name || bid);
                var rows = byBlock[bid];
                html += '<div class="tooltip-module">';
                html += '<div class="tooltip-module-title">' + esc(btitle) + '</div>';
                html += '<div class="tooltip-module-kv">';
                var ri;
                for (ri = 0; ri < rows.length; ri++) {
                    var row = rows[ri];
                    var lab = fieldLabel(row.fieldKey);
                    html += '<div class="tooltip-module-kv-row' + (row.unlocked ? '' : ' is-field-locked') + '">';
                    html += '<span class="tooltip-module-k">' + lab + '</span>';
                    if (row.unlocked) {
                        var inner = renderValueHtml(row.rule, row.rawVal, buffLookup);
                        if (!inner) inner = '<span class="tooltip-module-v">' + esc(row.rawVal) + '</span>';
                        html += inner.indexOf('tooltip-module-v') >= 0 ? inner : '<span class="tooltip-module-v">' + inner + '</span>';
                    } else {
                        var hintText = String(row.rule.locked_hint || '').trim();
                        if (hintText) html += '<span class="tooltip-module-locked-hint">' + esc(hintText) + '</span>';
                        html += buildLockedReqHtml(row.rule, character);
                    }
                    html += '</div>';
                }
                html += '</div></div>';
            }
            html += '</div>';
            return html;
        } catch (e) {
            return '';
        }
    }

    global.ItemFieldDisplayRules = {
        setTable: setTable,
        getFieldRule: getFieldRule,
        getBlocks: getBlocks,
        isFieldVisible: isFieldVisible,
        renderFieldBlocksHtml: renderFieldBlocksHtml
    };
})(window);
