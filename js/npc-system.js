/**
 * NPC 系统（运行时）
 * - 负责：读取 npc_registry.json -> 加载 NPC def / triggers；判定上班时间；扫描闲聊触发；打开 NPC 菜单
 * - 不负责：地图渲染（由场景/渲染器调用 openMenu）
 */
(function (global) {
    'use strict';

    var registry = null; // { npcs: { [npcId]: { def, triggers } } }
    var npcDefCache = {};      // npcId -> def json
    var npcTriggersCache = {}; // npcId -> triggers json

    // demo 存档：flags 与一次性触发记录（后续可替换为真实存档系统）
    var LS_FLAGS = 'cabi_demo_flags_v1';
    var LS_TRIGGERED = 'cabi_demo_triggered_entries_v1';

    // 日志输出：优先走配置注入的 logFn；兜底直接写入 GameLog
    var logFn = function () {};
    function log(message, type) {
        try {
            if (typeof logFn === 'function') {
                logFn(message, type);
                return;
            }
        } catch (e0) { /* ignore */ }
        try {
            if (global.GameLog && typeof global.GameLog.log === 'function') {
                global.GameLog.log(message, type || 'info');
            }
        } catch (e1) { /* ignore */ }
    }

    function safeJsonParse(raw, fallback) { try { return JSON.parse(raw); } catch (e) { return fallback; } }
    function getFlags() { return safeJsonParse(localStorage.getItem(LS_FLAGS) || '{}', {}); }
    function setFlag(k, v) { var f = getFlags(); f[String(k)] = v; localStorage.setItem(LS_FLAGS, JSON.stringify(f)); }
    function getTriggered() { return safeJsonParse(localStorage.getItem(LS_TRIGGERED) || '[]', []); }
    function markTriggered(entryId) {
        var arr = getTriggered();
        var id = (entryId == null) ? '' : String(entryId);
        if (!id) return;
        if (arr.indexOf(id) >= 0) return;
        arr.push(id);
        localStorage.setItem(LS_TRIGGERED, JSON.stringify(arr));
        log('[NPCSystem] Mark triggered: ' + id, 'system');
    }
    function isTriggered(entryId) {
        var id = (entryId == null) ? '' : String(entryId);
        if (!id) return false;
        return getTriggered().indexOf(id) >= 0;
    }

    function getPlayerName() {
        var el = document.getElementById('creation-name');
        return el && el.value ? el.value : '主角';
    }

    function parseHHMM(s) {
        s = String(s || '').trim();
        var m = /^(\d{1,2}):(\d{2})$/.exec(s);
        if (!m) return null;
        var hh = Math.max(0, Math.min(23, parseInt(m[1], 10) || 0));
        var mm = Math.max(0, Math.min(59, parseInt(m[2], 10) || 0));
        return hh * 60 + mm;
    }

    function isMinuteBetween(minOfDay, startMin, endMin) {
        // 半开区间 [start, end)，支持跨午夜
        minOfDay = Math.max(0, Math.min(24 * 60 - 1, Math.floor(Number(minOfDay) || 0)));
        startMin = Math.max(0, Math.min(24 * 60, Math.floor(Number(startMin) || 0)));
        endMin = Math.max(0, Math.min(24 * 60, Math.floor(Number(endMin) || 0)));
        if (startMin === endMin) return true;
        if (startMin < endMin) return (minOfDay >= startMin) && (minOfDay < endMin);
        return (minOfDay >= startMin) || (minOfDay < endMin);
    }

    function isNpcOnDuty(def) {
        if (!def || !def.appearanceSchedule || !global.GameTime) return true;
        var st = global.GameTime.getState ? global.GameTime.getState() : null;
        if (!st) return true;
        var start = parseHHMM(def.appearanceSchedule.start);
        var end = parseHHMM(def.appearanceSchedule.end);
        if (start == null || end == null) return true;
        // st.minuteOfDay 是权威输入：直接判断当前分钟是否落在 [start,end) 内（支持跨午夜）
        return isMinuteBetween(st.minuteOfDay, start, end);
    }

    function loadRegistry() {
        if (registry) return Promise.resolve(registry);
        if (typeof fetch !== 'function') return Promise.resolve(null);
        return fetch('data/npc/npc_registry.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { registry = j; return registry; })
            .catch(function () { registry = null; return null; });
    }

    function resolveNpcFiles(npcId) {
        return loadRegistry().then(function (reg) {
            if (!reg || !reg.npcs || !reg.npcs[npcId]) return null;
            return reg.npcs[npcId];
        });
    }

    function loadNpcDef(npcId) {
        if (npcDefCache[npcId]) return Promise.resolve(npcDefCache[npcId]);
        return resolveNpcFiles(npcId).then(function (files) {
            if (!files || !files.def || typeof fetch !== 'function') return null;
            return fetch(files.def).then(function (r) { return r.ok ? r.json() : null; }).then(function (def) {
                if (def && def.id) npcDefCache[npcId] = def;
                if (def && def.id && global.DialogueUI && def.sprite) global.DialogueUI.setPortrait(def.id, def.sprite);
                return def;
            });
        });
    }

    function loadNpcTriggers(npcId) {
        if (npcTriggersCache[npcId]) return Promise.resolve(npcTriggersCache[npcId]);
        return resolveNpcFiles(npcId).then(function (files) {
            if (!files || !files.triggers || typeof fetch !== 'function') return null;
            return fetch(files.triggers).then(function (r) { return r.ok ? r.json() : null; }).then(function (tr) {
                if (tr) npcTriggersCache[npcId] = tr;
                return tr;
            });
        });
    }

    function getSkillLevel(skillId) {
        if (!global.InventoryEquipment || typeof global.InventoryEquipment.getSkillLevel !== 'function') return 0;
        return global.InventoryEquipment.getSkillLevel(skillId);
    }

    function modifySkillLevel(skillId, delta, min) {
        if (!global.InventoryEquipment || typeof global.InventoryEquipment.getState !== 'function' || typeof global.InventoryEquipment.setState !== 'function') return;
        var st = global.InventoryEquipment.getState();
        if (!st.skills) st.skills = {};
        if (!st.skills[skillId]) st.skills[skillId] = { level: 0 };
        var cur = st.skills[skillId].level != null ? Math.max(0, parseInt(st.skills[skillId].level, 10)) : 0;
        var next = cur + (parseInt(delta, 10) || 0);
        var mn = (min != null) ? parseInt(min, 10) : 0;
        if (next < mn) next = mn;
        if (global.CombatSkills && typeof global.CombatSkills.getProgressionSkillMaxLevel === 'function') {
            var progMax = global.CombatSkills.getProgressionSkillMaxLevel(st, skillId);
            if (next > progMax) next = progMax;
        }
        st.skills[skillId].level = next;
        global.InventoryEquipment.setState(st);
    }

    function clampSkillLevelToProgression(st, skillId) {
        if (!st || !st.skills || !st.skills[skillId] || !global.CombatSkills || typeof global.CombatSkills.getProgressionSkillMaxLevel !== 'function') return;
        var prog = global.CombatSkills.getProgressionSkillMaxLevel(st, skillId);
        var lv = st.skills[skillId].level != null ? Math.max(0, parseInt(st.skills[skillId].level, 10)) : 0;
        if (lv > prog) st.skills[skillId].level = prog;
    }

    function modifySkillMaxLevelBonus(skillId, delta) {
        if (!global.InventoryEquipment || typeof global.InventoryEquipment.getState !== 'function' || typeof global.InventoryEquipment.setState !== 'function') return;
        var st = global.InventoryEquipment.getState();
        if (!st.skill_max_level_bonus || typeof st.skill_max_level_bonus !== 'object') st.skill_max_level_bonus = {};
        var cur = st.skill_max_level_bonus[skillId] != null ? parseInt(st.skill_max_level_bonus[skillId], 10) || 0 : 0;
        st.skill_max_level_bonus[skillId] = cur + (parseInt(delta, 10) || 0);
        clampSkillLevelToProgression(st, skillId);
        global.InventoryEquipment.setState(st);
    }

    function evalCondition(cond) {
        if (!cond || !cond.type) return false;
        if (cond.type === 'flagEquals') {
            var f = getFlags();
            var key = String(cond.flag);
            function normalizeFlagBool(v) {
                // 约定：未设置/未定义/空值都视为 false（支持 editor 或旧数据导出的 undefined/null 字符串）
                if (v === undefined || v === null) return false;
                if (typeof v === 'boolean') return v;
                if (typeof v === 'number') return v !== 0;
                if (typeof v === 'string') {
                    var s = v.trim().toLowerCase();
                    if (!s || s === 'undefined' || s === 'null') return false;
                    if (s === 'true' || s === '1') return true;
                    if (s === 'false' || s === '0') return false;
                }
                // 兜底：未知类型尽量保持“语义为 false”
                return false;
            }

            // cond.value 也可能来自 JSON/编辑器为字符串
            var cur = normalizeFlagBool(f[key]);
            var want = normalizeFlagBool(cond.value);
            return cur === want;
        }
        if (cond.type === 'skillLevelEquals') {
            return getSkillLevel(cond.skillId) === (parseInt(cond.level, 10) || 0);
        }
        if (cond.type === 'skillLevelGte') {
            return getSkillLevel(cond.skillId) >= (parseInt(cond.level, 10) || 0);
        }
        if (cond.type === 'timeBetween') {
            if (!global.GameTime || typeof global.GameTime.isTimeBetween !== 'function') return false;
            var s = parseHHMM(cond.start);
            var e = parseHHMM(cond.end);
            if (s == null || e == null) return false;
            return global.GameTime.isTimeBetween(Math.floor(s / 60), s % 60, Math.floor(e / 60), e % 60);
        }
        if (cond.type === 'timePeriodEquals') {
            if (!global.GameTime || typeof global.GameTime.getTimePeriod !== 'function') return false;
            return global.GameTime.getTimePeriod() === String(cond.value || '');
        }
        if (cond.type === 'not') return !evalCondition(cond.cond);
        if (cond.type === 'and') {
            var arrA = Array.isArray(cond.conds) ? cond.conds : [];
            if (!arrA.length) return true;
            for (var i = 0; i < arrA.length; i++) if (!evalCondition(arrA[i])) return false;
            return true;
        }
        if (cond.type === 'or') {
            var arrO = Array.isArray(cond.conds) ? cond.conds : [];
            if (!arrO.length) return false;
            for (var j = 0; j < arrO.length; j++) if (evalCondition(arrO[j])) return true;
            return false;
        }
        // hasItem：当前 demo 未接入背包查询接口，先保留 false（后续接 InventoryEquipment 背包查询可补）
        if (cond.type === 'hasItem') return false;
        return false;
    }

    function applyEffects(effects) {
        if (!Array.isArray(effects)) return;
        for (var i = 0; i < effects.length; i++) {
            var ef = effects[i];
            if (!ef || !ef.type) continue;
            if (ef.type === 'setFlag' && ef.params) {
                setFlag(ef.params.flag, ef.params.value);
                log('[NPCSystem] Effect setFlag: ' + String(ef.params.flag) + '=' + String(ef.params.value), 'system');
            }
            if (ef.type === 'modifySkillLevel' && ef.params) {
                var sid = ef.params.skillId;
                var before = getSkillLevel(sid);
                modifySkillLevel(ef.params.skillId, ef.params.delta, ef.params.min);
                var after = getSkillLevel(sid);
                log('[NPCSystem] Effect modifySkillLevel: ' + String(sid) + ' ' + String(before) + '->' + String(after), 'system');
            }
            if (ef.type === 'modifySkillMaxLevelBonus' && ef.params) {
                var sidB = ef.params.skillId;
                modifySkillMaxLevelBonus(sidB, ef.params.delta);
                log('[NPCSystem] Effect modifySkillMaxLevelBonus: ' + String(sidB) + ' delta=' + String(ef.params.delta), 'system');
            }
        }
    }

    function pickRandom(arr) {
        if (!arr || !arr.length) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function scanChatEntry(npcId) {
        return Promise.all([loadNpcDef(npcId), loadNpcTriggers(npcId)]).then(function (rows) {
            var def = rows[0];
            var tr = rows[1];
            if (!def || !tr || !Array.isArray(tr.entries)) return null;
            // 上班才存在：不在场则无法闲聊
            if (!isNpcOnDuty(def)) return { type: 'not_on_duty' };

            var candidates = [];
            var debug = [];

            function entryPassesDependencies(e) {
                if (!e) return false;
                // requires：需要先触发指定 entryId（repeatable=false 才会写入 triggered list）
                var reqsRaw = Array.isArray(e.requires) ? e.requires : [];
                var reqs = [];
                for (var ri = 0; ri < reqsRaw.length; ri++) {
                    var rid = reqsRaw[ri];
                    if (rid == null || rid === '') continue;
                    var rs = String(rid).trim();
                    if (!rs || rs === 'undefined' || rs === 'null') continue;
                    reqs.push(rs);
                }
                for (var ri = 0; ri < reqs.length; ri++) {
                    var rid = reqs[ri];
                    if (!rid) continue;
                    if (!isTriggered(rid)) return false;
                }
                // blocks：若触发过指定 entryId，则屏蔽
                var blksRaw = Array.isArray(e.blocks) ? e.blocks : [];
                var blks = [];
                for (var bi = 0; bi < blksRaw.length; bi++) {
                    var bid = blksRaw[bi];
                    if (bid == null || bid === '') continue;
                    var bs = String(bid).trim();
                    if (!bs || bs === 'undefined' || bs === 'null') continue;
                    blks.push(bs);
                }
                for (var bj = 0; bj < blks.length; bj++) {
                    var blkId = blks[bj];
                    if (!blkId) continue;
                    if (isTriggered(blkId)) return false;
                }
                return true;
            }

            for (var i = 0; i < tr.entries.length; i++) {
                var e = tr.entries[i];
                if (!e || e.entrySource !== 'chat') continue;
                if (e.repeatable === false && isTriggered(e.id)) continue;
                if (!entryPassesDependencies(e)) {
                    // 依赖未满足：跳过（仍记录到 debug 便于定位）
                    debug.push({ id: e.id, pass: false, cond: e.condition, requires: e.requires, blocks: e.blocks });
                    continue;
                }
                var pass = evalCondition(e.condition);
                debug.push({ id: e.id, pass: pass, cond: e.condition });
                if (!pass) continue;
                candidates.push(e);
            }
            log('[NPCSystem] scanChatEntry npc=' + String(npcId) + ', candidates=' + String(candidates.length), 'system');
            var picked = pickRandom(candidates);
            if (!picked) {
                // 诊断：当没有任何候选时，输出一次条件状态（便于定位“为什么不触发”）
                try {
                    var f = getFlags();
                    var lang = getSkillLevel('survival_language');
                    log('闲聊无可触发条目：flag lsy_has_talked=' + (f.lsy_has_talked === undefined ? 'undefined' : String(f.lsy_has_talked))
                        + '，survival_language=' + String(lang), 'warn');
                    for (var di = 0; di < debug.length; di++) {
                        if (di >= 6) break;
                        log(' - ' + debug[di].id + ' 条件' + (debug[di].pass ? '通过' : '不通过') + '：' + JSON.stringify(debug[di].cond || {}), 'warn');
                    }
                } catch (e2) { /* ignore */ }
                return { type: 'fallback', npc: def };
            }
            log('[NPCSystem] Picked chat entry: ' + String(picked.id) + ' (npc=' + String(npcId) + ')', 'system');
            return { type: 'entry', npc: def, entry: picked };
        });
    }

    // --- 菜单 UI（最小实现） ---
    var menuEl = null;
    function ensureMenuEl() {
        if (menuEl) return menuEl;
        menuEl = document.createElement('div');
        menuEl.id = 'npc-menu';
        menuEl.style.position = 'fixed';
        menuEl.style.left = '0';
        menuEl.style.top = '0';
        menuEl.style.right = '0';
        menuEl.style.bottom = '0';
        menuEl.style.background = 'rgba(0,0,0,0.55)';
        menuEl.style.display = 'none';
        menuEl.style.zIndex = '9999';
        menuEl.innerHTML = '' +
            '<div style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:320px; background:#252525; border:1px solid #444; border-radius:8px; padding:14px;">' +
            '  <div id="npc-menu-title" style="color:#ddd; font-weight:bold; margin-bottom:10px;">NPC</div>' +
            '  <div id="npc-menu-buttons" style="display:flex; gap:8px; flex-wrap:wrap;"></div>' +
            '  <div style="margin-top:10px; color:#666; font-size:12px;">提示：需要靠近 NPC 才能对话</div>' +
            '</div>';
        document.body.appendChild(menuEl);
        menuEl.addEventListener('click', function (e) { if (e.target === menuEl) closeMenu(); });
        return menuEl;
    }
    function closeMenu() { if (menuEl) menuEl.style.display = 'none'; }

    function openMenu(npcId) {
        ensureMenuEl();
        Promise.all([loadNpcDef(npcId)]).then(function (rows) {
            var def = rows[0];
            if (!def) {
                log('NPC 数据未加载：' + npcId + '（检查 npc_registry.json 路径）', 'warn');
                return;
            }
            if (!isNpcOnDuty(def)) {
                var t = (global.GameTime && global.GameTime.getDisplayString) ? (global.GameTime.getDisplayString() || '') : '';
                log('NPC 当前不在场（' + t + '）：' + npcId, 'warn');
                return;
            }
            menuEl.style.display = 'block';
            var title = document.getElementById('npc-menu-title');
            var btnWrap = document.getElementById('npc-menu-buttons');
            if (title) title.textContent = def.displayTitle || def.name || 'NPC';
            if (!btnWrap) return;
            btnWrap.innerHTML = '';

            function mkBtn(text, onClick) {
                var b = document.createElement('button');
                b.type = 'button';
                b.textContent = text;
                b.style.padding = '8px 12px';
                b.style.background = '#404040';
                b.style.border = '1px solid #555';
                b.style.color = '#fff';
                b.style.borderRadius = '6px';
                b.style.cursor = 'pointer';
                b.onclick = onClick;
                return b;
            }

            btnWrap.appendChild(mkBtn('闲聊', function () {
                closeMenu();
                log('[NPCSystem] NPC chat clicked: npc=' + String(npcId), 'system');
                scanChatEntry(npcId).then(function (res) {
                    if (!res || !global.DialogueUI) return;
                    if (res.type === 'not_on_duty') return;
                    if (res.type === 'fallback') {
                        log('[NPCSystem] chat fallback: npc=' + String(npcId), 'system');
                        global.DialogueUI.say({
                            speakerRole: 'npc',
                            speakerId: def.id,
                            speakerName: def.displayTitle || def.name || 'NPC',
                            text: '（摸鱼）……'
                        });
                        return;
                    }
                    if (res.type === 'entry') {
                        var entry = res.entry;
                        log('[NPCSystem] Execute chat entry: ' + String(entry.id), 'system');
                        var linesRich = entry && entry.dialogue && entry.dialogue.linesRich;
                        if (Array.isArray(linesRich)) {
                            global.DialogueUI.playLinesRich(linesRich, {
                                npcId: def.id,
                                npcName: def.displayTitle || def.name || 'NPC',
                                playerName: getPlayerName(),
                                options: entry && entry.dialogue ? entry.dialogue.options : null
                            });
                        } else if (entry && entry.dialogue && Array.isArray(entry.dialogue.lines)) {
                            global.DialogueUI.say({
                                speakerRole: 'npc',
                                speakerId: def.id,
                                speakerName: def.displayTitle || def.name || 'NPC',
                                text: entry.dialogue.lines.join('\n')
                            });
                        }
                        // effect 日志在 applyEffects 内输出
                        applyEffects(entry.effects);
                        if (entry.repeatable === false) markTriggered(entry.id);
                    }
                });
            }));

            btnWrap.appendChild(mkBtn('离开', function () { closeMenu(); }));
        });
    }

    global.NPCSystem = {
        configure: function (opts) {
            opts = opts || {};
            logFn = (typeof opts.log === 'function') ? opts.log : function () {};
        },
        /**
         * Demo 存档：仅用于当前工程阶段把 NPC 闲聊触发/flag 状态纳入存档。
         * 后续可替换为完整存档系统的统一读写。
         */
        getDemoState: function () {
            // deep-clone via JSON to avoid accidental external mutation
            var flags = null;
            var triggered = null;
            try { flags = getFlags(); } catch (e0) { flags = {}; }
            try { triggered = getTriggered(); } catch (e1) { triggered = []; }
            return {
                flags: isPlainObject(flags) ? flags : {},
                triggered: Array.isArray(triggered) ? triggered : []
            };
        },
        setDemoState: function (s) {
            if (!s || typeof s !== 'object') return;
            var nextFlags = s.flags && typeof s.flags === 'object' ? s.flags : {};
            var nextTriggered = Array.isArray(s.triggered) ? s.triggered : [];
            try {
                localStorage.setItem(LS_FLAGS, JSON.stringify(nextFlags));
            } catch (e2) { /* ignore */ }
            try {
                localStorage.setItem(LS_TRIGGERED, JSON.stringify(nextTriggered));
            } catch (e3) { /* ignore */ }
        },
        isNpcPresentNow: function (npcId) {
            var def = npcDefCache[npcId];
            if (!def) return true;
            return isNpcOnDuty(def);
        },
        preloadNpc: function (npcId) { return loadNpcDef(npcId).then(function () { return loadNpcTriggers(npcId); }); },
        openMenu: openMenu,
        scanChatEntry: scanChatEntry
    };
})(typeof window !== 'undefined' ? window : this);

// local helper (kept at file end to avoid hoist confusion)
function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

