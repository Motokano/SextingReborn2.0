(function (global) {
    'use strict';

    var table = { module_sets: {} };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function t(key, vars) {
        if (global && global.UIText && typeof global.UIText.t === 'function') {
            return global.UIText.t(key, vars);
        }
        return key;
    }

    function getSkillLevel(character, skillId) {
        if (!character || !character.skills || !skillId) return 0;
        var rec = character.skills[skillId];
        var lv = rec && rec.level != null ? parseInt(rec.level, 10) : 0;
        return isFinite(lv) && lv > 0 ? lv : 0;
    }

    /** 技能显示名：先查生存技能表，再查战斗技能表，兜底返回原始 id */
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
        return sid;
    }

    function normalizeContentHtml(content, tpl) {
        if (content == null) return '';
        if (typeof content === 'string') return '<div class="tooltip-module-text">' + esc(content) + '</div>';
        if (typeof content !== 'object') return '';
        var t = String(content.type || '').toLowerCase();
        if (t === 'text') {
            return '<div class="tooltip-module-text">' + esc(content.text || '') + '</div>';
        }
        if (t === 'csv_field_text') {
            var key = String(content.field || '').trim();
            var v = key && tpl ? tpl[key] : '';
            if (v == null || String(v).trim() === '') v = content.fallback || '';
            return '<div class="tooltip-module-text">' + esc(v || '') + '</div>';
        }
        if (t === 'list') {
            var items = Array.isArray(content.items) ? content.items : [];
            if (!items.length) return '';
            var li = '';
            for (var i = 0; i < items.length; i++) {
                li += '<li>' + esc(items[i]) + '</li>';
            }
            return '<ul class="tooltip-module-list">' + li + '</ul>';
        }
        if (t === 'kv') {
            var kv = Array.isArray(content.entries) ? content.entries : [];
            if (!kv.length) return '';
            var rows = '';
            for (var j = 0; j < kv.length; j++) {
                var e = kv[j] || {};
                rows += '<div class="tooltip-module-kv-row"><span class="tooltip-module-k">' + esc(e.k || '') + '</span><span class="tooltip-module-v">' + esc(e.v || '') + '</span></div>';
            }
            return '<div class="tooltip-module-kv">' + rows + '</div>';
        }
        if (t === 'tpl_kv') {
            // 从物品模板动态读取字段渲染（防具数值走此类型，技能解锁后可见）
            var entriesT = Array.isArray(content.entries) ? content.entries : [];
            var outT = '';
            for (var e2 = 0; e2 < entriesT.length; e2++) {
                var en = entriesT[e2] || {};
                var f = String(en.field || '').trim();
                if (!f || !tpl || tpl[f] == null) continue;
                var rawT = tpl[f];
                var vStrT = '';
                if (en.pct === true && typeof rawT === 'number' && isFinite(rawT)) {
                    vStrT = String(Math.round(rawT * 100));
                } else if (Array.isArray(rawT)) {
                    var mapT = (en.array_map && typeof en.array_map === 'object') ? en.array_map : null;
                    var partsT = [];
                    for (var a2 = 0; a2 < rawT.length; a2++) {
                        var kk2 = String(rawT[a2]);
                        partsT.push(mapT && mapT[kk2] != null ? mapT[kk2] : kk2);
                    }
                    vStrT = partsT.join('/');
                } else if (typeof rawT === 'object' && rawT !== null) {
                    // 对象字段（如 form_coefs {拳:1.0,掌:1.0}）→ "拳 1.0 / 掌 1.0"
                    var objParts = [];
                    for (var ok2 in rawT) {
                        if (rawT.hasOwnProperty(ok2)) objParts.push(ok2 + ' ' + rawT[ok2]);
                    }
                    vStrT = objParts.join(' / ');
                } else {
                    vStrT = String(rawT);
                }
                outT += '<div class="tooltip-module-text">' + esc(t(en.label_key || f, { v: vStrT })) + '</div>';
            }
            return outT;
        }
        return '';
    }

    function evalUnlock(unlock, character) {
        if (!unlock || typeof unlock !== 'object') return { unlocked: true, level: 0, current: 0, skillId: '' };
        var skillId = String(unlock.skill_id || '').trim();
        var level = Math.max(0, parseInt(unlock.level_min, 10) || 0);
        if (!skillId || level <= 0) return { unlocked: true, level: level, current: 0, skillId: skillId };
        var current = getSkillLevel(character, skillId);
        return {
            unlocked: current >= level,
            level: level,
            current: current,
            skillId: skillId,
            lockedHint: String(unlock.locked_hint || '').trim()
        };
    }

    function setTable(json) {
        if (json && typeof json === 'object' && json.module_sets && typeof json.module_sets === 'object') {
            table = { module_sets: json.module_sets };
            return;
        }
        table = { module_sets: {} };
    }

    function getModuleSet(setId) {
        var id = String(setId || '').trim();
        if (!id) return null;
        return table.module_sets[id] || null;
    }

    function renderTooltipModulesHtml(args) {
        var tpl = args && args.tpl;
        var setId = tpl && tpl.info_module_set_id ? String(tpl.info_module_set_id).trim() : '';
        if (!setId) return '';
        var set = getModuleSet(setId);
        if (!set || !Array.isArray(set.modules) || !set.modules.length) return '';
        var chara = args && args.character ? args.character : null;
        var html = '<div class="tooltip-modules">';
        for (var i = 0; i < set.modules.length; i++) {
            var m = set.modules[i] || {};
            var title = esc(m.title || m.module_id || t('item_info.module_default'));
            var st = evalUnlock(m.unlock, chara);
            html += '<div class="tooltip-module' + (st.unlocked ? '' : ' is-locked') + '">';
            html += '<div class="tooltip-module-title">' + title + '</div>';
            if (st.unlocked) {
                var contentHtml = normalizeContentHtml(m.content, tpl || {});
                if (contentHtml) html += contentHtml;
            } else {
                // 统一锁定样式：风味提示 + 明确的「需要什么技能、差几级」要求行（item_info.locked_hint）
                var need = Math.max(0, st.level - st.current);
                var hint = st.lockedHint || '';
                var skillName = getSkillDisplayName(st.skillId);
                var reqLine = t('item_info.locked_hint', { skillId: skillName, level: st.level, need: need });
                if (hint) html += '<div class="tooltip-module-locked-hint">' + esc(hint) + '</div>';
                html += '<div class="tooltip-module-req">' + esc(reqLine) + '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    global.ItemInfoModules = {
        setTable: setTable,
        getModuleSet: getModuleSet,
        renderTooltipModulesHtml: renderTooltipModulesHtml
    };
})(window);
