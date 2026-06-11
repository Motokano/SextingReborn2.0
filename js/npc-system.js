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
    /** npcId -> 合并后台词池文档（全局 dialogue_pools.json + 该 NPC 的 *_dialogue_pools.json，后者覆盖同名池） */
    var dialoguePoolsMergedCache = {};

    // demo 存档：flags 与一次性触发记录（后续可替换为真实存档系统）
    var LS_FLAGS = 'cabi_demo_flags_v1';
    var LS_TRIGGERED = 'cabi_demo_triggered_entries_v1';
    /** 与 CharacterAttributes.hidden_epithets「无用之人」同步，供 flagEquals 设计事件 */
    var FLAG_PLAYER_EPITHET_USELESS = 'player_epithet_useless_person';

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

    function removeTriggered(entryId) {
        var id = (entryId == null) ? '' : String(entryId);
        if (!id) return false;
        var arr = getTriggered();
        var ix = arr.indexOf(id);
        if (ix < 0) return false;
        arr.splice(ix, 1);
        try {
            localStorage.setItem(LS_TRIGGERED, JSON.stringify(arr));
        } catch (eRm) { /* ignore */ }
        return true;
    }

    /** 根据角色 hidden_epithets 写入/清除 demo flag（读档 setDemoState 后须再调一次） */
    function syncPlayerEpithetFlags() {
        var useless = (global.CharacterAttributes && global.CharacterAttributes.HIDDEN_EPITHET_USELESS) || '无用之人';
        var on = !!(global.CharacterAttributes && typeof global.CharacterAttributes.hasHiddenEpithet === 'function'
            && global.CharacterAttributes.hasHiddenEpithet(useless));
        setFlag(FLAG_PLAYER_EPITHET_USELESS, on);
    }

    function getPlayerName() {
        if (global.CharacterAttributes && typeof global.CharacterAttributes.getCharacterName === 'function') {
            var n = global.CharacterAttributes.getCharacterName();
            if (n) return n;
        }
        return '无名氏';
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

    function collectNpcIdsFromMap(map) {
        var out = {};
        function add(id) {
            if (id == null) return;
            var s = String(id).trim();
            if (s) out[s] = true;
        }
        if (map && Array.isArray(map.npcs)) {
            var i;
            for (i = 0; i < map.npcs.length; i++) add(map.npcs[i] && map.npcs[i].npc_id);
        }
        if (map && map.cooking_station_interact_npc_id != null) add(map.cooking_station_interact_npc_id);
        if (map && map.cooking_station_interact_npc_by_cell && typeof map.cooking_station_interact_npc_by_cell === 'object') {
            var keys = Object.keys(map.cooking_station_interact_npc_by_cell);
            var k;
            for (k = 0; k < keys.length; k++) add(map.cooking_station_interact_npc_by_cell[keys[k]]);
        }
        if (map && map.pharmacy_station_interact_npc_id != null) add(map.pharmacy_station_interact_npc_id);
        if (map && map.pharmacy_station_interact_npc_by_cell && typeof map.pharmacy_station_interact_npc_by_cell === 'object') {
            var pk = Object.keys(map.pharmacy_station_interact_npc_by_cell);
            var pi;
            for (pi = 0; pi < pk.length; pi++) add(map.pharmacy_station_interact_npc_by_cell[pk[pi]]);
        }
        if (map && map.compost_station_interact_npc_id != null) add(map.compost_station_interact_npc_id);
        if (map && map.compost_station_interact_npc_by_cell && typeof map.compost_station_interact_npc_by_cell === 'object') {
            var ck = Object.keys(map.compost_station_interact_npc_by_cell);
            var ci;
            for (ci = 0; ci < ck.length; ci++) add(map.compost_station_interact_npc_by_cell[ck[ci]]);
        }
        if (map && map.agriculture_station_interact_npc_id != null) add(map.agriculture_station_interact_npc_id);
        if (map && map.agriculture_station_interact_npc_by_cell && typeof map.agriculture_station_interact_npc_by_cell === 'object') {
            var agk = Object.keys(map.agriculture_station_interact_npc_by_cell);
            var agi;
            for (agi = 0; agi < agk.length; agi++) add(map.agriculture_station_interact_npc_by_cell[agk[agi]]);
        }
        if (map && map.warehouse_station_interact_npc_id != null) add(map.warehouse_station_interact_npc_id);
        if (map && map.warehouse_station_interact_npc_by_cell && typeof map.warehouse_station_interact_npc_by_cell === 'object') {
            var whk = Object.keys(map.warehouse_station_interact_npc_by_cell);
            var whi;
            for (whi = 0; whi < whk.length; whi++) add(map.warehouse_station_interact_npc_by_cell[whk[whi]]);
        }
        return Object.keys(out);
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

    function deriveDialoguePoolsPathFromDef(defPath) {
        if (!defPath || typeof defPath !== 'string') return null;
        if (!/\.json$/i.test(defPath)) return null;
        return defPath.replace(/\.json$/i, '_dialogue_pools.json');
    }

    function normalizePoolsDoc(j) {
        if (!j || typeof j !== 'object') return { schemaVersion: 1, pools: {} };
        var out = { schemaVersion: j.schemaVersion != null ? j.schemaVersion : 1, pools: {} };
        if (j.pools && typeof j.pools === 'object') out.pools = j.pools;
        return out;
    }

    /** 先应用 globalDoc 的 pools，再用 npcDoc 覆盖同名键（专用文件优先）。 */
    function mergePoolDocs(globalDoc, npcDoc) {
        var g = normalizePoolsDoc(globalDoc);
        var n = normalizePoolsDoc(npcDoc);
        var pools = {};
        var k;
        for (k in g.pools) {
            if (!Object.prototype.hasOwnProperty.call(g.pools, k)) continue;
            pools[k] = g.pools[k];
        }
        for (k in n.pools) {
            if (!Object.prototype.hasOwnProperty.call(n.pools, k)) continue;
            pools[k] = n.pools[k];
        }
        return { schemaVersion: n.schemaVersion || g.schemaVersion || 1, pools: pools };
    }

    function fetchPoolsJson(url) {
        if (!url || typeof fetch !== 'function') return Promise.resolve(null);
        return fetch(url)
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    /**
     * 加载某 NPC 闲聊可用的台词池：data/npc/dialogue_pools.json（共用）+ 注册表 dialogue_pools 或 def 同前缀 *_dialogue_pools.json。
     */
    function loadDialoguePoolsForNpc(npcId) {
        var nid = (npcId != null) ? String(npcId).trim() : '';
        if (!nid) {
            return fetchPoolsJson('data/npc/dialogue_pools.json').then(function (g) {
                return normalizePoolsDoc(g);
            });
        }
        if (dialoguePoolsMergedCache[nid]) return Promise.resolve(dialoguePoolsMergedCache[nid]);
        return resolveNpcFiles(nid).then(function (files) {
            var perUrl = null;
            if (files) {
                if (files.dialogue_pools && String(files.dialogue_pools).trim()) {
                    perUrl = String(files.dialogue_pools).trim();
                } else if (files.def) {
                    perUrl = deriveDialoguePoolsPathFromDef(files.def);
                }
            }
            var globalUrl = 'data/npc/dialogue_pools.json';
            return fetchPoolsJson(globalUrl).then(function (gJson) {
                if (!perUrl || perUrl === globalUrl) {
                    var only = mergePoolDocs(normalizePoolsDoc(null), gJson);
                    dialoguePoolsMergedCache[nid] = only;
                    return only;
                }
                return fetchPoolsJson(perUrl).then(function (pJson) {
                    var merged = mergePoolDocs(gJson, pJson);
                    dialoguePoolsMergedCache[nid] = merged;
                    return merged;
                });
            });
        });
    }

    /** 台词池行：兼容 string 或 { speaker, text, avatar? }（与事件 linesRich 口径一致） */
    function normalizePoolLineForRuntime(raw) {
        if (raw == null) return null;
        if (typeof raw === 'string') {
            var ts = String(raw).trim();
            if (!ts) return null;
            return { speaker: 'npc', text: String(raw), avatar: '' };
        }
        if (typeof raw === 'object') {
            var sp = String(raw.speaker || raw.role || 'npc').trim() || 'npc';
            var tx = (raw.text != null) ? String(raw.text) : (raw.content != null ? String(raw.content) : '');
            if (!String(tx).trim()) return null;
            var av = raw.avatar != null ? String(raw.avatar).trim() : '';
            return { speaker: sp, text: (raw.text != null ? String(raw.text) : String(raw.content || '')), avatar: av };
        }
        return null;
    }

    function getDirectNonEmptyLines(pool) {
        if (!pool || !Array.isArray(pool.lines)) return [];
        var out = [];
        for (var i = 0; i < pool.lines.length; i++) {
            var n = normalizePoolLineForRuntime(pool.lines[i]);
            if (n) out.push(n);
        }
        return out;
    }

    /** merge_lines：本池 lines + includePools 递归展开（防循环）；用于合成大池后随机一句 */
    function collectMergedLines(doc, poolId, visiting) {
        visiting = visiting || {};
        if (visiting[poolId]) return [];
        visiting[poolId] = true;
        var pool = doc && doc.pools ? doc.pools[poolId] : null;
        var out = [];
        var direct = getDirectNonEmptyLines(pool);
        for (var di = 0; di < direct.length; di++) out.push(direct[di]);
        var inc = pool && Array.isArray(pool.includePools) ? pool.includePools : [];
        for (var j = 0; j < inc.length; j++) {
            var sid = inc[j] != null ? String(inc[j]).trim() : '';
            if (!sid) continue;
            var sub = collectMergedLines(doc, sid, visiting);
            for (var k = 0; k < sub.length; k++) out.push(sub[k]);
        }
        visiting[poolId] = false;
        return out;
    }

    /**
     * pick_pool：只把「本池直接 lines」与「各引用池的直接 lines」当作子池，先随机子池再随机一句（不展开子池的 includePools）。
     * merge_lines（默认）：本池 + includePools 递归合并全部台词后随机。
     */
    function pickFallbackLineFromDoc(poolId, doc) {
        var pid = String(poolId || '').trim();
        if (!pid) return null;
        if (!doc || typeof doc !== 'object' || !doc.pools || typeof doc.pools !== 'object') return null;
        var pool = doc.pools[pid];
        if (!pool) return null;
        var mode = pool.composeMode === 'pick_pool' ? 'pick_pool' : 'merge_lines';
        if (mode === 'pick_pool') {
            var buckets = [];
            var ownL = getDirectNonEmptyLines(pool);
            if (ownL.length) buckets.push(ownL);
            var inc = Array.isArray(pool.includePools) ? pool.includePools : [];
            for (var a = 0; a < inc.length; a++) {
                var subId = inc[a] != null ? String(inc[a]).trim() : '';
                if (!subId) continue;
                var op = doc.pools[subId];
                var ol = getDirectNonEmptyLines(op);
                if (ol.length) buckets.push(ol);
            }
            if (!buckets.length) return null;
            var pickB = buckets[Math.floor(Math.random() * buckets.length)];
            return pickB[Math.floor(Math.random() * pickB.length)];
        }
        var all = collectMergedLines(doc, pid, {});
        if (!all.length) return null;
        return all[Math.floor(Math.random() * all.length)];
    }

    /** 用于 fallbackPoolRules 的 merge_pools：各池按 merge_lines 展开后拼接，再随机一句 */
    function pickFallbackLineFromMergedPoolIds(poolIds, doc) {
        if (!doc || typeof doc !== 'object' || !doc.pools || typeof doc.pools !== 'object') return null;
        if (!poolIds || !poolIds.length) return null;
        var merged = [];
        for (var mi = 0; mi < poolIds.length; mi++) {
            var pid = poolIds[mi] != null ? String(poolIds[mi]).trim() : '';
            if (!pid) continue;
            var chunk = collectMergedLines(doc, pid, {});
            for (var mj = 0; mj < chunk.length; mj++) merged.push(chunk[mj]);
        }
        if (!merged.length) return null;
        return merged[Math.floor(Math.random() * merged.length)];
    }

    function getSkillLevel(skillId) {
        if (!global.InventoryEquipment || typeof global.InventoryEquipment.getSkillLevel !== 'function') return 0;
        return global.InventoryEquipment.getSkillLevel(skillId);
    }

    function getCurrentBmiValue() {
        if (!global.Survival || typeof global.Survival.getBMI !== 'function') return null;
        var bmi = Number(global.Survival.getBMI());
        return isFinite(bmi) ? bmi : null;
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
        if (cond.type === 'true') return true;
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
        function isRegisteredSurvivalSkillId(skillId) {
            return global.SurvivalSkills && typeof global.SurvivalSkills.isRegisteredSkillId === 'function' && global.SurvivalSkills.isRegisteredSkillId(skillId);
        }
        if (cond.type === 'survivalSkillLevelEquals') {
            if (!isRegisteredSurvivalSkillId(cond.skillId)) return false;
            return getSkillLevel(cond.skillId) === (parseInt(cond.level, 10) || 0);
        }
        if (cond.type === 'survivalSkillLevelGte') {
            if (!isRegisteredSurvivalSkillId(cond.skillId)) return false;
            return getSkillLevel(cond.skillId) >= (parseInt(cond.level, 10) || 0);
        }
        if (cond.type === 'bmiGte') {
            var bmiV0 = getCurrentBmiValue();
            var gteV = Number(cond.value);
            if (bmiV0 == null || !isFinite(gteV)) return false;
            return bmiV0 >= gteV;
        }
        if (cond.type === 'bmiLte') {
            var bmiV1 = getCurrentBmiValue();
            var lteV = Number(cond.value);
            if (bmiV1 == null || !isFinite(lteV)) return false;
            return bmiV1 <= lteV;
        }
        if (cond.type === 'bmiRange') {
            var bmiV2 = getCurrentBmiValue();
            var minV = Number(cond.min);
            var maxV = Number(cond.max);
            if (bmiV2 == null || !isFinite(minV) || !isFinite(maxV) || minV > maxV) return false;
            return bmiV2 >= minV && bmiV2 <= maxV;
        }
        if (cond.type === 'characterHiddenEpithetEquals') {
            var wantEp = String(cond.epithet || '').trim();
            if (!wantEp || !global.CharacterAttributes || typeof global.CharacterAttributes.hasHiddenEpithet !== 'function') return false;
            return global.CharacterAttributes.hasHiddenEpithet(wantEp);
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
        if (cond.type === 'postEffectObtainedGte') {
            if (!global.CharacterAttributes || typeof global.CharacterAttributes.getPostEffectsObtainedCount !== 'function') return false;
            var want = (cond.value != null) ? cond.value : (cond.count != null ? cond.count : cond.min);
            want = parseInt(want, 10);
            if (!isFinite(want) || want < 0) want = 1;
            return global.CharacterAttributes.getPostEffectsObtainedCount() >= want;
        }
        if (cond.type === 'lastCombatDefenderHitArcEquals') {
            var wantArc = String(cond.value || cond.arc || '').trim().toLowerCase();
            if (!wantArc) return false;
            var c0 = global.SceneCtx && global.SceneCtx.lastCombatDirectional ? global.SceneCtx.lastCombatDirectional : null;
            if (!c0) return false;
            var gotArc = String(c0.defender_hit_arc || '').trim().toLowerCase();
            return gotArc === wantArc;
        }
        if (cond.type === 'lastCombatAttackerStrikeArcEquals') {
            var wantArc2 = String(cond.value || cond.arc || '').trim().toLowerCase();
            if (!wantArc2) return false;
            var c1 = global.SceneCtx && global.SceneCtx.lastCombatDirectional ? global.SceneCtx.lastCombatDirectional : null;
            if (!c1) return false;
            var gotArc2 = String(c1.attacker_strike_arc || '').trim().toLowerCase();
            return gotArc2 === wantArc2;
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
        if (cond.type === 'hasItem') {
            var itemId = cond.itemId != null ? String(cond.itemId).trim() : '';
            if (!itemId) return false;
            if (!global.InventoryEquipment || typeof global.InventoryEquipment.countCarriedItemsByTemplateId !== 'function') return false;
            var need = cond.count != null ? Math.floor(Number(cond.count)) : 1;
            if (!isFinite(need) || need < 1) need = 1;
            return global.InventoryEquipment.countCarriedItemsByTemplateId(itemId) >= need;
        }
        return false;
    }

    function refreshAfterNpcInventoryMutation() {
        try {
            if (global.SceneCtx && typeof global.SceneCtx.updateStatusPanel === 'function') {
                global.SceneCtx.updateStatusPanel();
            }
        } catch (e0) { /* ignore */ }
        try {
            if (global.SceneRenderer && typeof global.SceneRenderer.render === 'function') {
                global.SceneRenderer.render();
            }
        } catch (e1) { /* ignore */ }
    }

    function buildAttrExpEventContext(effectType, effectParams, effectMeta) {
        var meta = effectMeta || {};
        var eventKind = meta.event_kind || 'dialogue';
        var eventName = meta.event_name || 'npc_effect_applied';
        var sourceId = meta.source_id || '';
        var tick = -1;
        try {
            if (global.Survival && typeof global.Survival.getState === 'function') {
                var st = global.Survival.getState() || {};
                if (st.tickCount != null) tick = Math.max(0, Math.floor(Number(st.tickCount) || 0));
            }
        } catch (eTick) { /* ignore */ }
        return {
            event_kind: eventKind,
            event_name: eventName,
            source_id: sourceId,
            effect_type: effectType || '',
            effect_params: effectParams || {},
            tick: tick
        };
    }

    function applyEffects(effects, effectMeta) {
        if (!Array.isArray(effects)) return;
        var IE = global.InventoryEquipment;
        var CA = global.CharacterAttributes;
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
                var dLv = after - before;
                if (global.GameLog && global.UIText && typeof global.UIText.t === 'function') {
                    global.GameLog.log(global.UIText.t('log.debug.proficiency.skill_level', {
                        skillId: String(sid),
                        before: String(before),
                        after: String(after),
                        delta: String(dLv)
                    }), 'system');
                } else {
                    log('[NPCSystem] Effect modifySkillLevel: ' + String(sid) + ' ' + String(before) + '→' + String(after) + ' (Δ' + String(dLv) + ')', 'system');
                }
            }
            if (ef.type === 'modifySkillMaxLevelBonus' && ef.params) {
                var sidB = ef.params.skillId;
                modifySkillMaxLevelBonus(sidB, ef.params.delta);
                log('[NPCSystem] Effect modifySkillMaxLevelBonus: ' + String(sidB) + ' delta=' + String(ef.params.delta), 'system');
            }
            if (ef.type === 'removeItem' && ef.params && IE && typeof IE.removeCarriedItemsByTemplateId === 'function') {
                var rid = ef.params.itemId != null ? String(ef.params.itemId).trim() : '';
                var rc = ef.params.count != null ? Math.floor(Number(ef.params.count)) : 1;
                if (!isFinite(rc) || rc < 1) rc = 1;
                var rStrict = ef.params.strict !== false;
                if (rid) {
                    var rr = IE.removeCarriedItemsByTemplateId(rid, rc, { strict: rStrict });
                    log('[NPCSystem] Effect removeItem: ' + rid + ' x' + String(rc) + ' → removed=' + String(rr.removed)
                        + ' ok=' + String(!!rr.ok) + (rr.shortfall ? (' shortfall=' + String(rr.shortfall)) : ''), rr.ok ? 'system' : 'warn');
                    if (rr.removed > 0) refreshAfterNpcInventoryMutation();
                }
            }
            if (ef.type === 'giveItem' && ef.params && IE && typeof IE.giveCarriedItemsByTemplateId === 'function') {
                var gid = ef.params.itemId != null ? String(ef.params.itemId).trim() : '';
                var gc = ef.params.count != null ? Math.floor(Number(ef.params.count)) : 1;
                if (!isFinite(gc) || gc < 1) gc = 1;
                var gq = ef.params.quality_tier;
                if (gid) {
                    var gr = IE.giveCarriedItemsByTemplateId(gid, gc, gq);
                    log('[NPCSystem] Effect giveItem: ' + gid + ' x' + String(gc) + ' → placed=' + String(gr.placed)
                        + ' ok=' + String(!!gr.ok) + (gr.shortfall ? (' shortfall=' + String(gr.shortfall)) : ''), gr.ok ? 'system' : 'warn');
                    if (gr.placed > 0) refreshAfterNpcInventoryMutation();
                }
            }
            /** 主灶台 `SceneCtx.cooking_station_runtime`：料理水槽「无限水」开关（仅主灶台 tryCook 扣水会跳过；临时灶不受影响）。 */
            if (ef.type === 'setCookingStationWater' && ef.params && global.SceneCtx) {
                try {
                    var sc = global.SceneCtx;
                    if (!sc.cooking_station_runtime || typeof sc.cooking_station_runtime !== 'object') {
                        sc.cooking_station_runtime = {
                            fuel_points: 0,
                            water_points: 0,
                            water_unlimited: false,
                            installed_accessory_item_ids: [],
                            active_craft: null
                        };
                    }
                    var cr = sc.cooking_station_runtime;
                    if (ef.params.unlimited === true || ef.params.unlimited === 'true' || ef.params.unlimited === 1) {
                        cr.water_unlimited = true;
                    } else if (ef.params.unlimited === false || ef.params.unlimited === 'false' || ef.params.unlimited === 0) {
                        cr.water_unlimited = false;
                    }
                    log('[NPCSystem] Effect setCookingStationWater: water_unlimited=' + String(!!cr.water_unlimited), 'system');
                    refreshAfterNpcInventoryMutation();
                } catch (eCookW) {
                    log('[NPCSystem] Effect setCookingStationWater failed: ' + String(eCookW && eCookW.message ? eCookW.message : eCookW), 'warn');
                }
            }
            if (ef.type === 'grantAttributeExp' && ef.params) {
                var grantCtx = buildAttrExpEventContext(ef.type, ef.params, effectMeta);
                if (!CA || typeof CA.grantAttributeExp !== 'function') {
                    log('[NPCSystem] Effect grantAttributeExp skipped: CharacterAttributes.grantAttributeExp unavailable'
                        + ' event=' + String(grantCtx.event_name)
                        + ' source=' + String(grantCtx.source_id), 'warn');
                    continue;
                }
                try {
                    var grants = Array.isArray(ef.params.grants) ? ef.params.grants : [];
                    var ownerId = ef.params.ownerId != null ? String(ef.params.ownerId).trim() : 'player';
                    var grantRes = CA.grantAttributeExp(ownerId || 'player', grants, grantCtx);
                    if (!grantRes || grantRes.ok !== true) {
                        log('[NPCSystem] Effect grantAttributeExp failed: event=' + String(grantCtx.event_name)
                            + ' source=' + String(grantCtx.source_id)
                            + ' reason=' + String(grantRes && grantRes.reason ? grantRes.reason : 'unknown'), 'warn');
                    } else {
                        log('[NPCSystem] Effect grantAttributeExp applied: event=' + String(grantCtx.event_name)
                            + ' source=' + String(grantCtx.source_id)
                            + ' count=' + String(Array.isArray(grantRes.applied) ? grantRes.applied.length : 0), 'system');
                    }
                } catch (eGrantAttr) {
                    log('[NPCSystem] Effect grantAttributeExp exception: event=' + String(grantCtx.event_name)
                        + ' source=' + String(grantCtx.source_id)
                        + ' err=' + String(eGrantAttr && eGrantAttr.message ? eGrantAttr.message : eGrantAttr), 'warn');
                }
            }
            if (ef.type === 'settleAttributeExpOnce') {
                var settleCtx = buildAttrExpEventContext(ef.type, ef.params || {}, effectMeta);
                if (!CA || typeof CA.settleAttributeExpOnce !== 'function') {
                    log('[NPCSystem] Effect settleAttributeExpOnce skipped: CharacterAttributes.settleAttributeExpOnce unavailable'
                        + ' event=' + String(settleCtx.event_name)
                        + ' source=' + String(settleCtx.source_id), 'warn');
                    continue;
                }
                try {
                    var ownerId2 = ef.params && ef.params.ownerId != null ? String(ef.params.ownerId).trim() : 'player';
                    var settleRes = CA.settleAttributeExpOnce(ownerId2 || 'player', settleCtx);
                    if (!settleRes || settleRes.ok !== true) {
                        log('[NPCSystem] Effect settleAttributeExpOnce failed: event=' + String(settleCtx.event_name)
                            + ' source=' + String(settleCtx.source_id)
                            + ' reason=' + String(settleRes && settleRes.reason ? settleRes.reason : 'unknown'), 'warn');
                    } else if (settleRes.dedup_skipped) {
                        log('[NPCSystem] Effect settleAttributeExpOnce dedup skipped: event=' + String(settleCtx.event_name)
                            + ' source=' + String(settleCtx.source_id), 'system');
                    } else if (settleRes.lock_skipped) {
                        log('[NPCSystem] Effect settleAttributeExpOnce lock skipped: event=' + String(settleCtx.event_name)
                            + ' source=' + String(settleCtx.source_id), 'warn');
                    } else {
                        log('[NPCSystem] Effect settleAttributeExpOnce done: event=' + String(settleCtx.event_name)
                            + ' source=' + String(settleCtx.source_id)
                            + ' any_success=' + String(!!settleRes.any_success), 'system');
                    }
                } catch (eSettleAttr) {
                    log('[NPCSystem] Effect settleAttributeExpOnce exception: event=' + String(settleCtx.event_name)
                        + ' source=' + String(settleCtx.source_id)
                        + ' err=' + String(eSettleAttr && eSettleAttr.message ? eSettleAttr.message : eSettleAttr), 'warn');
                }
            }
        }
    }

    function pickRandom(arr) {
        if (!arr || !arr.length) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /** 闲聊条目与 fallbackPoolRules 共用：requires / blocks + triggered 语义 */
    function entryPassesDependencies(e) {
        if (!e) return false;
        var reqsRaw = Array.isArray(e.requires) ? e.requires : [];
        var reqs = [];
        for (var ri = 0; ri < reqsRaw.length; ri++) {
            var rid0 = reqsRaw[ri];
            if (rid0 == null || rid0 === '') continue;
            var rs = String(rid0).trim();
            if (!rs || rs === 'undefined' || rs === 'null') continue;
            reqs.push(rs);
        }
        for (var rj = 0; rj < reqs.length; rj++) {
            var rid1 = reqs[rj];
            if (!rid1) continue;
            if (!isTriggered(rid1)) return false;
        }
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

    function normalizeRulePoolIds(rule) {
        var ids = [];
        if (Array.isArray(rule.poolIds)) {
            for (var i = 0; i < rule.poolIds.length; i++) {
                var s = rule.poolIds[i] != null ? String(rule.poolIds[i]).trim() : '';
                if (s) ids.push(s);
            }
        }
        if (!ids.length && rule.poolId != null && String(rule.poolId).trim()) {
            ids.push(String(rule.poolId).trim());
        }
        return ids;
    }

    /**
     * 闲聊无事件命中时：按 NPC def 的 fallbackPoolRules **从上到下列表顺序** 检测；**仅第一条**
     * 同时满足（id / repeatable 已触发跳过 / requires / blocks / condition / 有池 id）的规则生效。
     * 其后规则即使也满足也不参与本轮。
     * poolPickMode pick_one（默认）：在该规则 poolIds 中随机一个池 id → pickFallbackLineFromDoc。
     * poolPickMode merge_pools：合并 poolIds 各池展开台词后随机一句 → pickFallbackLineFromMergedPoolIds。
     * 无规则或无任何一条通过时回落到 fallbackDialoguePoolId。
     * 注：match_weight 字段保留兼容旧档，**运行时不再使用**。
     */
    function resolveFallbackPick(def) {
        var defaultPool = (def && def.fallbackDialoguePoolId) ? String(def.fallbackDialoguePoolId).trim() : '';
        var rules = (def && Array.isArray(def.fallbackPoolRules)) ? def.fallbackPoolRules : [];
        if (!rules.length) {
            return { poolId: defaultPool, poolIds: null, poolPickMode: null, rule: null };
        }
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            if (!rule) continue;
            var rid = rule.id != null ? String(rule.id).trim() : '';
            if (!rid) continue;
            if (rule.repeatable === false && isTriggered(rid)) continue;
            if (!entryPassesDependencies(rule)) continue;
            if (!rule.condition || typeof rule.condition !== 'object' || !rule.condition.type) continue;
            if (!evalCondition(rule.condition)) continue;
            var poolIds = normalizeRulePoolIds(rule);
            if (!poolIds.length) continue;

            var pickMode = (rule.poolPickMode === 'merge_pools') ? 'merge_pools' : 'pick_one';
            if (pickMode === 'merge_pools') {
                return { poolId: null, poolIds: poolIds.slice(), poolPickMode: 'merge_pools', rule: rule };
            }
            var sub = pickRandom(poolIds);
            return {
                poolId: (sub && String(sub).trim()) ? String(sub).trim() : defaultPool,
                poolIds: null,
                poolPickMode: 'pick_one',
                rule: rule
            };
        }
        return { poolId: defaultPool, poolIds: null, poolPickMode: null, rule: null };
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
    function isMenuOpen() {
        return !!(menuEl && menuEl.style && menuEl.style.display !== 'none');
    }

    function openMenu(npcId) {
        ensureMenuEl();
        Promise.all([loadNpcDef(npcId)]).then(function (rows) {
            var def = rows[0];
            if (global.SceneApp && typeof global.SceneApp.guardPlayerActionBlocked === 'function') {
                var act = global.SceneApp.ACTION_TYPES;
                var npcActionType = (act && act.NPC_INTERACT) ? act.NPC_INTERACT : 'npc_interact';
                if (global.SceneApp.guardPlayerActionBlocked(npcActionType)) return;
            }
            if (global.BuffSystem && typeof global.BuffSystem.hasBuffByBuffId === 'function'
                && global.BuffSystem.hasBuffByBuffId('player', 'survival_dirty_messy')) {
                log('你现在邋里邋遢，NPC 不愿与你互动。', 'warn');
                return;
            }
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

            function shouldShowOpenCookingPanelButton(def0) {
                if (!def0 || !def0.mainMenu || typeof def0.mainMenu !== 'object') return false;
                if (def0.mainMenu.showOpenCookingPanel === true) return true;
                var tags = Array.isArray(def0.tags) ? def0.tags : [];
                return tags.indexOf('cooking_station') >= 0;
            }

            function shouldShowOpenPharmacyPanelButton(def0) {
                if (!def0 || !def0.mainMenu || typeof def0.mainMenu !== 'object') return false;
                if (def0.mainMenu.showOpenPharmacyPanel === true) return true;
                var tagsP = Array.isArray(def0.tags) ? def0.tags : [];
                return tagsP.indexOf('pharmacy_station') >= 0;
            }

            function shouldShowOpenCompostPanelButton(def0) {
                if (!def0 || !def0.mainMenu || typeof def0.mainMenu !== 'object') return false;
                if (def0.mainMenu.showOpenCompostPanel === true) return true;
                var tagsC = Array.isArray(def0.tags) ? def0.tags : [];
                return tagsC.indexOf('compost_station') >= 0;
            }

            function shouldShowOpenAgriculturePanelButton(def0) {
                if (!def0 || !def0.mainMenu || typeof def0.mainMenu !== 'object') return false;
                if (def0.mainMenu.showOpenAgriculturePanel === true) return true;
                var tagsA = Array.isArray(def0.tags) ? def0.tags : [];
                return tagsA.indexOf('agriculture_station') >= 0;
            }

            function shouldShowOpenHideoutWarehousePanelButton(def0) {
                if (!def0 || !def0.mainMenu || typeof def0.mainMenu !== 'object') return false;
                if (def0.mainMenu.showOpenHideoutWarehousePanel === true) return true;
                var tagsW = Array.isArray(def0.tags) ? def0.tags : [];
                return tagsW.indexOf('warehouse_station') >= 0;
            }

            function shouldShowSleepAtBedButton(def0) {
                if (!def0 || !def0.mainMenu || typeof def0.mainMenu !== 'object') return false;
                if (def0.mainMenu.showSleepAtBed === true) return true;
                var tagsB = Array.isArray(def0.tags) ? def0.tags : [];
                return tagsB.indexOf('bed_station') >= 0;
            }

            function tUi(key, fb) {
                try {
                    if (global.UIText && typeof global.UIText.t === 'function') return global.UIText.t(key);
                } catch (eT) { /* ignore */ }
                return fb;
            }

            btnWrap.appendChild(mkBtn('闲聊', function () {
                closeMenu();
                log('[NPCSystem] NPC chat clicked: npc=' + String(npcId), 'system');
                scanChatEntry(npcId).then(function (res) {
                    if (!res || !global.DialogueUI) return;
                    if (res.type === 'not_on_duty') return;
                    if (res.type === 'fallback') {
                        log('[NPCSystem] chat fallback: npc=' + String(npcId), 'system');
                        var fbPick = resolveFallbackPick(def);
                        loadDialoguePoolsForNpc(npcId).then(function (poolDoc) {
                            var fbText = null;
                            if (fbPick.poolPickMode === 'merge_pools' && fbPick.poolIds && fbPick.poolIds.length) {
                                fbText = pickFallbackLineFromMergedPoolIds(fbPick.poolIds, poolDoc);
                            }
                            if (!fbText) fbText = pickFallbackLineFromDoc(fbPick.poolId, poolDoc);
                            if (!fbText) fbText = pickFallbackLineFromDoc((def.fallbackDialoguePoolId && String(def.fallbackDialoguePoolId).trim()) ? String(def.fallbackDialoguePoolId).trim() : '', poolDoc);
                            var fbLine = fbText;
                            if (typeof fbLine === 'string') {
                                fbLine = { speaker: 'npc', text: fbLine, avatar: '' };
                            }
                            if (!fbLine || !String(fbLine.text || '').trim()) {
                                fbLine = { speaker: 'npc', text: '（摸鱼）……', avatar: '' };
                            }
                            global.DialogueUI.playLinesRich([{
                                speaker: fbLine.speaker || 'npc',
                                text: String(fbLine.text || ''),
                                avatar: fbLine.avatar || ''
                            }], {
                                npcId: def.id,
                                npcName: def.displayTitle || def.name || 'NPC',
                                playerName: getPlayerName(),
                                onQueueExhausted: function () {
                                    if (fbPick.rule && fbPick.rule.repeatable === false && fbPick.rule.id) {
                                        markTriggered(String(fbPick.rule.id).trim());
                                    }
                                }
                            });
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
                                options: entry && entry.dialogue ? entry.dialogue.options : null,
                                onQueueExhausted: function () {
                                    applyEffects(entry.effects, {
                                        event_kind: 'dialogue',
                                        event_name: 'npc_dialogue_entry_effects',
                                        source_id: entry && entry.id ? String(entry.id) : '',
                                        npc_id: def && def.id ? String(def.id) : ''
                                    });
                                    if (entry.repeatable === false) markTriggered(entry.id);
                                    if (entry.id === 'supervisor.firstTalk_01'
                                        && global.CharacterAttributes
                                        && typeof global.CharacterAttributes.isCharacterCreationCompleted === 'function'
                                        && !global.CharacterAttributes.isCharacterCreationCompleted()
                                        && global.SceneApp
                                        && typeof global.SceneApp.openCharacterCreationAfterIntro === 'function') {
                                        global.SceneApp.openCharacterCreationAfterIntro();
                                    }
                                }
                            });
                        } else if (entry && entry.dialogue && Array.isArray(entry.dialogue.lines)) {
                            global.DialogueUI.say({
                                speakerRole: 'npc',
                                speakerId: def.id,
                                speakerName: def.displayTitle || def.name || 'NPC',
                                text: entry.dialogue.lines.join('\n')
                            });
                            applyEffects(entry.effects, {
                                event_kind: 'dialogue',
                                event_name: 'npc_dialogue_entry_effects',
                                source_id: entry && entry.id ? String(entry.id) : '',
                                npc_id: def && def.id ? String(def.id) : ''
                            });
                            if (entry.repeatable === false) markTriggered(entry.id);
                        }
                    }
                });
            }));

            if (shouldShowOpenCookingPanelButton(def)) {
                var cookBtn = mkBtn(tUi('npc.menu.open_cooking_panel', '使用灶台'), function () {
                    if (global.SceneApp && typeof global.SceneApp.isCookingStationPanelBlockedByRepair === 'function'
                        && global.SceneApp.isCookingStationPanelBlockedByRepair()) {
                        try {
                            if (global.SceneCtx && typeof global.SceneCtx.showMsg === 'function' && global.UIText && typeof global.UIText.t === 'function') {
                                global.SceneCtx.showMsg(global.UIText.t('cooking.station.locked_until_repaired'), 'info');
                            }
                        } catch (eL) { /* ignore */ }
                        return;
                    }
                    closeMenu();
                    if (global.SceneApp && typeof global.SceneApp.openCookingStationPanel === 'function') {
                        global.SceneApp.openCookingStationPanel();
                    }
                });
                if (global.SceneApp && typeof global.SceneApp.isCookingStationPanelBlockedByRepair === 'function'
                    && global.SceneApp.isCookingStationPanelBlockedByRepair()) {
                    cookBtn.disabled = true;
                    cookBtn.style.opacity = '0.55';
                    cookBtn.style.cursor = 'not-allowed';
                    cookBtn.title = tUi('npc.menu.open_cooking_panel_locked', '请先与灶台对话修好灶台');
                }
                btnWrap.appendChild(cookBtn);
            }

            if (shouldShowOpenPharmacyPanelButton(def)) {
                var pharmBtn = mkBtn(tUi('npc.menu.open_pharmacy_panel', '使用制药台'), function () {
                    if (global.SceneApp && typeof global.SceneApp.isPharmacyStationPanelBlockedByRepair === 'function'
                        && global.SceneApp.isPharmacyStationPanelBlockedByRepair()) {
                        try {
                            if (global.SceneCtx && typeof global.SceneCtx.showMsg === 'function' && global.UIText && typeof global.UIText.t === 'function') {
                                global.SceneCtx.showMsg(global.UIText.t('pharmacy.station.locked_until_repaired'), 'info');
                            }
                        } catch (eLp) { /* ignore */ }
                        return;
                    }
                    closeMenu();
                    if (global.SceneApp && typeof global.SceneApp.openPharmacyStationPanel === 'function') {
                        global.SceneApp.openPharmacyStationPanel();
                    }
                });
                if (global.SceneApp && typeof global.SceneApp.isPharmacyStationPanelBlockedByRepair === 'function'
                    && global.SceneApp.isPharmacyStationPanelBlockedByRepair()) {
                    pharmBtn.disabled = true;
                    pharmBtn.style.opacity = '0.55';
                    pharmBtn.style.cursor = 'not-allowed';
                    pharmBtn.title = tUi('npc.menu.open_pharmacy_panel_locked', '请先与制药台对话，修好后再使用。');
                }
                btnWrap.appendChild(pharmBtn);
            }

            if (shouldShowOpenCompostPanelButton(def)) {
                var compostBtn = mkBtn(tUi('npc.menu.open_compost_panel', '使用制肥桶'), function () {
                    closeMenu();
                    if (global.SceneApp && typeof global.SceneApp.openCompostStationPanel === 'function') {
                        global.SceneApp.openCompostStationPanel();
                    }
                });
                btnWrap.appendChild(compostBtn);
            }

            if (shouldShowOpenAgriculturePanelButton(def)) {
                var agBtn = mkBtn(tUi('npc.menu.open_agriculture_panel', '管理农田'), function () {
                    closeMenu();
                    if (global.SceneApp && typeof global.SceneApp.openAgriculturePanel === 'function') {
                        global.SceneApp.openAgriculturePanel();
                    }
                });
                btnWrap.appendChild(agBtn);
            }

            if (shouldShowOpenHideoutWarehousePanelButton(def)) {
                var whBtn = mkBtn(tUi('npc.menu.open_hideout_warehouse_panel', '打开藏身处仓库'), function () {
                    closeMenu();
                    if (global.SceneApp && typeof global.SceneApp.openHideoutWarehousePanel === 'function') {
                        global.SceneApp.openHideoutWarehousePanel();
                    }
                });
                btnWrap.appendChild(whBtn);
            }

            if (shouldShowSleepAtBedButton(def)) {
                var bedBtn = mkBtn(tUi('npc.menu.sleep_at_bed', '睡觉'), function () {
                    closeMenu();
                    if (global.SceneApp && typeof global.SceneApp.trySleepAtBed === 'function') {
                        global.SceneApp.trySleepAtBed();
                    }
                });
                btnWrap.appendChild(bedBtn);
            }

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
        /** 读取 demo flags（与 setFlag / 存档 setDemoState 同源），供场景门闸等查询；缺键返回 undefined。 */
        getFlagValue: function (key) {
            if (key == null) return undefined;
            var f = getFlags();
            return Object.prototype.hasOwnProperty.call(f, String(key)) ? f[String(key)] : undefined;
        },
        /** 与 NPC 条件里 flag 布尔归一一致：仅 true / 1 / \"true\" / \"1\" 为真。 */
        isDemoFlagTrue: function (key) {
            var v = (function (k) {
                if (k == null) return undefined;
                var f = getFlags();
                return Object.prototype.hasOwnProperty.call(f, String(k)) ? f[String(k)] : undefined;
            })(key);
            if (v === true || v === 1) return true;
            if (typeof v === 'string') {
                var s = v.trim().toLowerCase();
                return s === 'true' || s === '1';
            }
            return false;
        },
        setDemoFlag: function (key, value) {
            if (key == null) return;
            setFlag(String(key), value);
        },
        /** 新档/重置烹饪台任务：清锁、清已听说明，并移除灶台相关一次性闲聊触发记录（避免与 reset flag 冲突）。 */
        resetCookingStationRepairQuestFlags: function () {
            setFlag('cooking_base_station_unlocked', false);
            setFlag('cooking_base_station_repair_briefed', false);
            removeTriggered('station.cooking.repair_intro');
            removeTriggered('station.cooking.repair_unlock');
        },
        resetPharmacyStationRepairQuestFlags: function () {
            setFlag('npc_station_pharmacy_base_repaired', false);
            setFlag('pharmacy_base_station_repair_briefed', false);
            removeTriggered('station.pharmacy.repair_intro');
            removeTriggered('station.pharmacy.repair_unlock');
        },
        isNpcPresentNow: function (npcId) {
            var def = npcDefCache[npcId];
            if (!def) return true;
            return isNpcOnDuty(def);
        },
        preloadNpc: function (npcId) { return loadNpcDef(npcId).then(function () { return loadNpcTriggers(npcId); }); },
        /** 热重载台词池（清空按 NPC 合并缓存；下次闲聊会重新 fetch 共用 + 专用文件） */
        reloadDialoguePools: function () {
            dialoguePoolsMergedCache = {};
            return Promise.resolve();
        },
        /** 预加载地图上出现的 NPC def（供地块短名等同步读取 npcDefCache） */
        preloadNpcsFromMap: function (map) {
            var ids = collectNpcIdsFromMap(map);
            if (!ids.length) return Promise.resolve();
            return Promise.all(ids.map(function (id) {
                return loadNpcDef(id).then(function () { return loadNpcTriggers(id); });
            }));
        },
        preloadAllMapsNpcs: function (maps) {
            if (!maps || typeof maps !== 'object') return Promise.resolve();
            var mids = Object.keys(maps);
            if (!mids.length) return Promise.resolve();
            return Promise.all(mids.map(function (mid) {
                return global.NPCSystem.preloadNpcsFromMap(maps[mid]);
            }));
        },
        /** 地图格上展示的短名称（优先 displayTitle，否则 name）；无缓存时返回空串。 */
        getNpcMapLabel: function (npcId) {
            if (!npcId) return '';
            var d = npcDefCache[String(npcId)];
            if (!d || typeof d !== 'object') return '';
            var nl = d.npcLabel != null ? String(d.npcLabel).trim() : '';
            if (nl) return nl;
            var dt = d.displayTitle != null ? String(d.displayTitle).trim() : '';
            if (dt) return dt;
            var nm = d.name != null ? String(d.name).trim() : '';
            return nm || '';
        },
        isMenuOpen: isMenuOpen,
        openMenu: openMenu,
        scanChatEntry: scanChatEntry,
        FLAG_PLAYER_EPITHET_USELESS: FLAG_PLAYER_EPITHET_USELESS,
        syncPlayerEpithetFlags: syncPlayerEpithetFlags
    };
})(typeof window !== 'undefined' ? window : this);

// local helper (kept at file end to avoid hoist confusion)
function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

