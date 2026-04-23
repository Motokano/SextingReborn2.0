(function (global) {
    'use strict';

    var table = { module_sets: {} };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function getSkillLevel(character, skillId) {
        if (!character || !character.skills || !skillId) return 0;
        var rec = character.skills[skillId];
        var lv = rec && rec.level != null ? parseInt(rec.level, 10) : 0;
        return isFinite(lv) && lv > 0 ? lv : 0;
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
            var title = esc(m.title || m.module_id || '模块');
            var st = evalUnlock(m.unlock, chara);
            html += '<div class="tooltip-module' + (st.unlocked ? '' : ' is-locked') + '">';
            html += '<div class="tooltip-module-title">' + title + '</div>';
            if (st.unlocked) {
                html += normalizeContentHtml(m.content, tpl || {});
            } else {
                var need = Math.max(0, st.level - st.current);
                var hint = st.lockedHint || ('需 ' + st.skillId + ' 达到 ' + st.level + ' 级（还差 ' + need + ' 级）');
                html += '<div class="tooltip-module-locked-hint">' + esc(hint) + '</div>';
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
