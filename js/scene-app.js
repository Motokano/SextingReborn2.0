// Main scene entry
(function () {
    var E = window.GameEngine;
    var G = window.Gathering;
    var IE = window.InventoryEquipment;
    var CELL_PX = E.CELL_PX;
    var CENTER_OFFSET_X = E.CENTER_OFFSET_X;
    var CENTER_OFFSET_Y = E.CENTER_OFFSET_Y;

    var idleTickMs = 3000;
    var COOKING_FUEL_MAX_POINTS = 1000;
    var COOKING_WATER_MAX_POINTS = 1000;
    var cookingMethods = {};
    var cookingRecipes = [];
    /** 由 data/cooking-system-config.csv 注入，可改 id 后 item-editor 维护物品模板 */
    var cookingFailureItemId = 'food_cooking_fail_generic';

    var pharmacyMethods = {};
    var pharmacyRecipes = [];
    /** 由 data/pharmacy-system-config.csv 注入，可改 id 后 item-editor 维护物品模板 */
    var pharmacyFailureItemId = 'food_pharmacy_fail_generic';
    var cookingTempStationLifetimeTicks = 50;
    var COOKING_TEMP_STATION_ENTITY_ID = 'cooking_station_temp';
    /** 与 `npc_station_cooking_base_triggers` / `NPCSystem` demo flags 对齐：主灶台绑定设施 NPC 时，修好前禁止烹饪 UI 与结算 */
    var COOKING_BASE_STATION_UNLOCK_FLAG = 'cooking_base_station_unlocked';

    function parseCookingSystemConfigCsv(text) {
        var out = {
            cooking_global_failure_item_id: 'food_cooking_fail_generic',
            cooking_temp_station_lifetime_ticks: 50
        };
        if (!text || typeof text !== 'string') return out;
        var lines = text.split(/\r?\n/);
        var li;
        for (li = 0; li < lines.length; li++) {
            var line = String(lines[li] || '').trim();
            if (!line || line.indexOf('#') === 0) continue;
            var comma = line.indexOf(',');
            if (comma < 0) continue;
            var key = line.slice(0, comma).trim();
            var rest = line.slice(comma + 1);
            var comma2 = rest.indexOf(',');
            var val = (comma2 >= 0 ? rest.slice(0, comma2) : rest).trim();
            if (key === 'cooking_global_failure_item_id' && val) out.cooking_global_failure_item_id = val;
            if (key === 'cooking_temp_station_lifetime_ticks') {
                var life = Math.max(1, Math.floor(Number(val) || 0));
                if (life > 0) out.cooking_temp_station_lifetime_ticks = life;
            }
        }
        return out;
    }
    function parseCompostEventActionsCsv(text) {
        var map = {};
        if (!text || typeof text !== 'string') return map;
        var lines = text.split(/\r?\n/);
        if (!lines.length) return map;
        var headers = String(lines[0] || '').split(',');
        var idIdx = headers.indexOf('action_id');
        var displayIdx = headers.indexOf('display');
        if (displayIdx < 0) displayIdx = headers.indexOf('display_name');
        if (idIdx < 0 || displayIdx < 0) return map;
        for (var i = 1; i < lines.length; i++) {
            var line = String(lines[i] || '').trim();
            if (!line) continue;
            var cells = line.split(',');
            var id = String(cells[idIdx] || '').trim();
            var display = String(cells[displayIdx] || '').trim();
            if (!id || !display) continue;
            map[id] = display;
        }
        return map;
    }
    var gatheringIdleTimer = null;
    var gatheringIdleAt = null;
    var tiaoXiIdleTimer = null;
    var restIdleTimer = null;
    var tiaoXiCapModeNotified = false;
    var timeHudVisible = true;
    var combatRenderProfileTimer = null;

    function getIdleTickMs() {
        var n = parseInt(idleTickMs, 10);
        if (!isFinite(n) || n < 200) n = 3000;
        return n;
    }

    function getRestAutoTickMs() {
        var Surv = window.Survival;
        var cfg = Surv && typeof Surv.getConfig === 'function' ? Surv.getConfig() : null;
        var sec = cfg ? Number(cfg.rest_action_auto_tick_seconds) : 5;
        if (!isFinite(sec) || sec <= 0) sec = 5;
        return Math.max(1000, Math.floor(sec * 1000));
    }

    // Shared context for renderer/systems
    window.SceneCtx = {
        E: E,
        G: G,
        IE: IE,
        CELL_PX: CELL_PX,
        CENTER_OFFSET_X: CENTER_OFFSET_X,
        CENTER_OFFSET_Y: CENTER_OFFSET_Y,
        actions: {},
        dirtyCells: [],
        renderProfile: 'normal',
        pushDirtyCell: function (x, y) {
            if (x == null || y == null) return;
            this.dirtyCells.push({ x: x, y: y });
        },
        /**
         * 标脏蹑步选点相关地图格，供 tile-renderer-v2 在「partial dirty」模式下重画。
         * 机制：V2 在 dirtyCells 非空时只对列表内格子 clearRect + drawDynamicCell；未列入的格保留旧 canvas 像素。
         * 因此除高亮环（切比雪夫 1..r）外，再包含中心格与外扩一圈（切比雪夫 ≤ r+1 的整块方形），
         * 覆盖「身边 8 格」、邻接白雾、leap 描边线宽造成的视觉外溢，避免关模式后仍残留青色框。
         */
        pushDirtyNieBuRing: function (cx, cy, r) {
            var map = E.getMap();
            if (!map || cx == null || cy == null) return;
            var radius = Math.max(1, parseInt(r, 10) || 2);
            var pad = 1;
            var maxD = radius + pad;
            var dy;
            for (dy = -maxD; dy <= maxD; dy++) {
                var dx;
                for (dx = -maxD; dx <= maxD; dx++) {
                    var px = cx + dx;
                    var py = cy + dy;
                    if (px < 0 || py < 0 || px >= map.width || py >= map.height) continue;
                    this.pushDirtyCell(px, py);
                }
            }
        },
        /**
         * 关闭蹑步选点。scene-renderer 在 true→false 当帧可整视野重画；此处仍对环上格 pushDirty，
         * 避免下一帧走 V2 partial 时漏格导致青色高亮残留在 canvas 上。
         * ringCX/ringCY 缺省为当前玩家格；radiusOpt 缺省为 nieBuLeapRadius（蹑步起跳前应以起跳格+半径传入）。
         */
        exitFootworkNieBuMode: function (ringCX, ringCY, radiusOpt) {
            if (!this.footworkNieBuMode) return;
            this.footworkNieBuMode = false;
            var E0 = this.E || window.GameEngine;
            if (!E0 || typeof this.pushDirtyNieBuRing !== 'function') return;
            var map = typeof E0.getMap === 'function' ? E0.getMap() : null;
            var st = typeof E0.getState === 'function' ? E0.getState() : null;
            if (!map || !st) return;
            var cx = ringCX != null ? ringCX : st.x;
            var cy = ringCY != null ? ringCY : st.y;
            var r = radiusOpt != null ? radiusOpt : (this.nieBuLeapRadius != null ? this.nieBuLeapRadius : 2);
            this.pushDirtyNieBuRing(cx, cy, r);
        },
        isTimeHudVisible: function () { return !!timeHudVisible; },
        footworkNieBuMode: false,
        nieBuLeapRadius: 2,
        idleActionType: '',
        /**
         * 左侧状态栏区块显示规则接口（默认全开）：
         * - 值可为 boolean
         * - 也可为函数 () => boolean（后续可接入任意条件）
         */
        leftHudBlockVisibilityRules: {
            role: true,
            limbs: true,
            combat_resources: true,
            survival: true,
            quick_belt: true,
            attrs: true
        },
        /**
         * 生存循环指标显示规则接口（默认全开）：
         * - 值可为 boolean
         * - 也可为函数 (survivalState, metricId) => boolean
         */
        survivalMetricVisibilityRules: {
            satiety: true,
            thirst: true,
            mood: true,
            nutrition: true,
            dirtyness: true,
            energy: true,
            stamina: true,
            fatigue: true,
            weight: true
        },
        /** 右上角 Buff 条（与 leftHudBlockVisibilityRules 共用 shouldShowLeftHudBlock('buff_hud')） */
        buffHudVisible: true,
        lastAttackedEnemyId: null,
        /**
         * 同一次 map 攻击交换内：本 tick 已作为招架承担肢登记的肢 id（与 combat-pipeline 互斥/日志一致）。
         * `attackEnemy` 入口会 clear；`combat-pipeline` 在招架解析成功时经 recordPlayerExchangeParryLimb 累加（去重）。
         */
        playerExchangeParryLimbs: [],
        /**
         * 同一次交换内：玩家本击用于普攻的出招肢，招架承担肢时不得复用；玩家先手还击链内在玩家进攻管线后写入（见 attackEnemy）。
         */
        playerExchangeAttackLimb: null,
        clearPlayerExchangeLimbLocks: function () {
            this.playerExchangeParryLimbs = [];
            this.playerExchangeAttackLimb = null;
        },
        recordPlayerExchangeParryLimb: function (limbId) {
            if (!limbId) return;
            if (!this.playerExchangeParryLimbs) this.playerExchangeParryLimbs = [];
            if (this.playerExchangeParryLimbs.indexOf(limbId) < 0) {
                this.playerExchangeParryLimbs.push(limbId);
            }
        },
        setLeftHudBlockVisibilityRule: function (blockId, rule) {
            if (!blockId) return;
            this.leftHudBlockVisibilityRules = this.leftHudBlockVisibilityRules || {};
            this.leftHudBlockVisibilityRules[blockId] = rule;
        },
        setSurvivalMetricVisibilityRule: function (metricId, rule) {
            if (!metricId) return;
            this.survivalMetricVisibilityRules = this.survivalMetricVisibilityRules || {};
            this.survivalMetricVisibilityRules[String(metricId)] = rule;
        },
        shouldShowLeftHudBlock: function (blockId) {
            if (blockId === 'buff_hud') {
                if (this.buffHudVisible === false) return false;
            }
            var rules = this.leftHudBlockVisibilityRules || {};
            var rule = rules[blockId];
            if (typeof rule === 'function') {
                try { return !!rule(); } catch (e0) { return true; }
            }
            if (rule === undefined || rule === null) return true;
            return !!rule;
        },
        shouldShowSurvivalMetric: function (metricId, survivalState) {
            var key = metricId != null ? String(metricId) : '';
            if (!key) return true;
            var rules = this.survivalMetricVisibilityRules || {};
            var rule = rules[key];
            if (typeof rule === 'function') {
                try { return !!rule(survivalState || null, key); } catch (e0) { return true; }
            }
            if (rule === undefined || rule === null) return true;
            return !!rule;
        },
        /**
         * 快捷动作栏 · 固定槽（常态动作）：玩家在「动作」菜单点 📌 登记。
         * 支持 token：
         * - hub|skillId|actionId
         * - action|actionId
         * 与情境动作（采集/脚下/护体等）分离，见 .cursor/rules/quick-action-bar-agent.mdc
         */
        action_bar_slots: [null, null, null, null],
        getActionBarSlots: function () {
            var a = this.action_bar_slots;
            if (!Array.isArray(a)) return [null, null, null, null];
            var out = [null, null, null, null];
            var i;
            for (i = 0; i < 4; i++) out[i] = a[i] != null ? String(a[i]).trim() : null;
            return out;
        },
        setActionBarSlots: function (arr) {
            var out = [null, null, null, null];
            if (arr && Array.isArray(arr)) {
                var j;
                for (j = 0; j < 4 && j < arr.length; j++) {
                    var v = arr[j];
                    if (v == null || v === '') continue;
                    var s = String(v).trim();
                    if (s.indexOf('hub|') === 0) {
                        var partsHub = s.split('|');
                        if (partsHub.length < 3 || !partsHub[1] || !partsHub[2]) continue;
                        out[j] = s;
                        continue;
                    }
                    if (s.indexOf('action|') === 0) {
                        var partsAction = s.split('|');
                        if (partsAction.length < 2 || !partsAction[1]) continue;
                        if (partsAction[1] !== 'rest_toggle') continue;
                        out[j] = s;
                    }
                }
            }
            this.action_bar_slots = out;
        },
        /** 烹饪图鉴：recipe_id -> true（存档见 SaveSystem sceneUi.known_cooking_recipe_ids） */
        known_cooking_recipes: {},
        /** 统一配方图鉴：known_recipe_ids_by_system[recipe_system][recipe_id] = true（迁移期运行时双写） */
        known_recipe_ids_by_system: {},
        /** 统一配方 schema 校验报告（仅调试可视化，不影响主流程） */
        recipe_schema_validation_report: { errors: [], warnings: [] }
    };

    function showMsg(text, logType) {
        if (window.GameLog && text) window.GameLog.log(text, logType || 'info');
    }
    window.SceneCtx.showMsg = showMsg;

    function ui(key, vars) {
        try {
            if (!window.UIText || typeof window.UIText.t !== 'function') throw new Error('[SceneApp] UIText not ready');
            return window.UIText.t(key, vars);
        } catch (e) {
            var msg = '[E_UI_CALL] ' + JSON.stringify({ module: 'SceneApp', key: String(key || ''), fix_hint: 'Usually add/fix key in data/ui_text_zhCN.json' });
            var err = new Error(msg + ' cause=' + (e && e.message ? e.message : String(e)));
            err.code = 'E_UI_CALL';
            err.details = { module: 'SceneApp', key: String(key || '') };
            err.cause = e;
            throw err;
        }
    }
    var ATTR_EXP_DEBUG_STORAGE_KEY = 'cabi_attr_exp_debug_enabled_v1';

    function getAttrExpDebugEnabledFromStorage() {
        try {
            if (typeof localStorage === 'undefined') return false;
            return localStorage.getItem(ATTR_EXP_DEBUG_STORAGE_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function setAttrExpDebugEnabledToStorage(enabled) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(ATTR_EXP_DEBUG_STORAGE_KEY, enabled ? '1' : '0');
        } catch (e) { /* ignore storage failure */ }
    }

    function isStoryMovementLocked() {
        if (window.DialogueUI && typeof window.DialogueUI.isDialogueOpen === 'function' && window.DialogueUI.isDialogueOpen()) return true;
        if (window.NPCSystem && typeof window.NPCSystem.isMenuOpen === 'function' && window.NPCSystem.isMenuOpen()) return true;
        var ov = document.getElementById('character-creation-overlay');
        if (ov && !ov.classList.contains('hidden')) return true;
        return false;
    }

    function isPreCreationGameplayRestricted() {
        var CA = window.CharacterAttributes;
        return !!(CA && typeof CA.isCharacterCreationCompleted === 'function' && !CA.isCharacterCreationCompleted());
    }

    function showIntroBlockedMsg() {
        try {
            showMsg(ui('intro.blocked.action'), 'info');
        } catch (e0) {
            showMsg('现在还无法使用。', 'info');
        }
    }

    function syncIntroShellUi() {
        var CA = window.CharacterAttributes;
        var done = CA && typeof CA.isCharacterCreationCompleted === 'function' && CA.isCharacterCreationCompleted();
        if (document.body) {
            if (done) document.body.classList.remove('intro-shell-active');
            else document.body.classList.add('intro-shell-active');
        }
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (window.GameLog && typeof window.GameLog.clampLogPanelForLeftHud === 'function') {
            window.GameLog.clampLogPanelForLeftHud();
        }
    }

    // Route NPC messages into game log
    if (window.NPCSystem && typeof window.NPCSystem.configure === 'function') {
        window.NPCSystem.configure({ log: showMsg });
    }

    function normalizePortal(p, fallback) {
        var out = {
            x: p.x,
            y: p.y,
            target_map_id: p.target_map_id,
            target_x: (p.target_x != null) ? p.target_x : (fallback && fallback.target_x != null ? fallback.target_x : 0),
            target_y: (p.target_y != null) ? p.target_y : (fallback && fallback.target_y != null ? fallback.target_y : 0),
            label: p.label
        };
        return out;
    }

    function mergeMapData(base, loaded) {
        var m = {};
        for (var k in base) m[k] = base[k];
        for (var k2 in loaded) m[k2] = loaded[k2];

        // portals: fill missing target_x/target_y for old maps
        if (Array.isArray(loaded.portals)) {
            var basePortals = Array.isArray(base.portals) ? base.portals : [];
            m.portals = loaded.portals.map(function (p) {
                var fb = null;
                for (var i = 0; i < basePortals.length; i++) {
                    var bp = basePortals[i];
                    if (bp && bp.x === p.x && bp.y === p.y && bp.target_map_id === p.target_map_id) { fb = bp; break; }
                }
                return normalizePortal(p, fb);
            });
        }
        if (!Array.isArray(m.blocks)) m.blocks = [];
        if (!Array.isArray(m.portals)) m.portals = [];
        if (!Array.isArray(m.entities)) m.entities = m.entities ? m.entities : undefined;
        if (!Array.isArray(m.npcs)) m.npcs = m.npcs ? m.npcs : undefined;
        return m;
    }

    function bootstrapMapsFromJson() {
        if (!E || typeof E.getMaps !== 'function' || typeof E.setMaps !== 'function') return;
        var baseMaps = E.getMaps();
        var ids = Object.keys(baseMaps || {});
        if (!ids.length || typeof fetch !== 'function') return;

        return Promise.all(ids.map(function (id) {
            return fetch('data/maps/' + id + '.json')
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (json) { return { id: id, json: json }; })
                .catch(function () { return { id: id, json: null }; });
        })).then(function (rows) {
            var next = {};
            for (var i = 0; i < ids.length; i++) next[ids[i]] = baseMaps[ids[i]];
            for (var j = 0; j < rows.length; j++) {
                var row = rows[j];
                if (!row || !row.id || !row.json) continue;
                next[row.id] = mergeMapData(baseMaps[row.id] || {}, row.json);
            }
            E.setMaps(next);
            if (window.NPCSystem && typeof window.NPCSystem.preloadAllMapsNpcs === 'function') {
                window.NPCSystem.preloadAllMapsNpcs(next).then(function () { render(); }).catch(function () { render(); });
            } else {
                render();
            }
        });
    }

    var playerSpriteUrls = { down: '', up: '', left: '', right: '' };
    var currentFacing = 'down';
    var currentFacingDir = 4; // 8-dir: 0 up, 2 right, 4 down, 6 left

    function updatePlayerAvatarImage() {
        var wrap = document.getElementById('player-avatar');
        var img = document.getElementById('player-avatar-img');
        if (!wrap || !img) return;
        var url = playerSpriteUrls[currentFacing] || '';
        if (!url) {
            img.src = '';
            img.removeAttribute('src');
            wrap.classList.remove('avatar-has-image');
            return;
        }
        img.onload = function () {
            wrap.classList.add('avatar-has-image');
        };
        img.onerror = function () {
            wrap.classList.remove('avatar-has-image');
        };
        img.src = url;
    }

    function updatePlayerDirectionIndicator() {
        var el = document.getElementById('player-direction-indicator');
        if (!el) return;
        var deg = normalizeFacingDir(currentFacingDir) * 45;
        el.style.transform = 'translate(-50%, -50%) rotate(' + deg + 'deg)';
    }

    function normalizeFacingDir(v) {
        var n = Number(v);
        if (!isFinite(n)) return 4;
        n = Math.round(n) % 8;
        if (n < 0) n += 8;
        return n;
    }

    function facingDirToVector(dir) {
        switch (normalizeFacingDir(dir)) {
            case 0: return { x: 0, y: -1 };
            case 1: return { x: 1, y: -1 };
            case 2: return { x: 1, y: 0 };
            case 3: return { x: 1, y: 1 };
            case 4: return { x: 0, y: 1 };
            case 5: return { x: -1, y: 1 };
            case 6: return { x: -1, y: 0 };
            case 7: return { x: -1, y: -1 };
            default: return { x: 0, y: 1 };
        }
    }

    function facingDirToCardinal(dir) {
        var d = normalizeFacingDir(dir);
        if (d === 0 || d === 1 || d === 7) return 'up';
        if (d === 2 || d === 3) return 'right';
        if (d === 4 || d === 5) return 'down';
        return 'left';
    }

    function facingDirFromMove(dx, dy) {
        var x = Number(dx) || 0;
        var y = Number(dy) || 0;
        if (!x && !y) return currentFacingDir;
        if (x > 0 && y < 0) return 1;
        if (x > 0 && y > 0) return 3;
        if (x < 0 && y > 0) return 5;
        if (x < 0 && y < 0) return 7;
        if (x > 0) return 2;
        if (x < 0) return 6;
        if (y < 0) return 0;
        return 4;
    }

    function setFacingDir(dir) {
        currentFacingDir = normalizeFacingDir(dir);
        currentFacing = facingDirToCardinal(currentFacingDir);
        updatePlayerAvatarImage();
        updatePlayerDirectionIndicator();
        return currentFacingDir;
    }

    function getFacingDir() {
        return normalizeFacingDir(currentFacingDir);
    }

    function setFacingFromMove(dx, dy) {
        return setFacingDir(facingDirFromMove(dx, dy));
    }
    window.SceneCtx.setFacingFromMove = setFacingFromMove;
    window.SceneCtx.getFacingDir = getFacingDir;
    window.SceneCtx.setFacingDir = setFacingDir;
    window.SceneCtx.getFacingVector = function () {
        return facingDirToVector(currentFacingDir);
    };
    window.PlayerFacing = {
        getDir: getFacingDir,
        setDir: setFacingDir,
        setFromMove: setFacingFromMove,
        getVector: function () { return facingDirToVector(currentFacingDir); },
        getCardinal: function () { return currentFacing; }
    };

    function setPlayerAvatar(url) {
        var u = (url != null && url !== '') ? url : '';
        playerSpriteUrls.down = playerSpriteUrls.up = playerSpriteUrls.left = playerSpriteUrls.right = u;
        updatePlayerAvatarImage();
        if (window.EntityAppearance) window.EntityAppearance.setEntityAppearanceSilent('player', u);
    }

    function setPlayerAvatarSprites(urls) {
        if (urls && typeof urls === 'object') {
            if (urls.down != null) playerSpriteUrls.down = urls.down ? String(urls.down) : '';
            if (urls.up != null) playerSpriteUrls.up = urls.up ? String(urls.up) : '';
            if (urls.left != null) playerSpriteUrls.left = urls.left ? String(urls.left) : '';
            if (urls.right != null) playerSpriteUrls.right = urls.right ? String(urls.right) : '';
        }
        updatePlayerAvatarImage();
    }

    window.setPlayerAvatar = setPlayerAvatar;
    window.setPlayerAvatarSprites = setPlayerAvatarSprites;

    if (window.EntityAppearance) {
        EntityAppearance.onAppearanceChange(function (entityId, imageUrl) {
            if (entityId === 'player') setPlayerAvatar(imageUrl);
        });
    }

    var defaultGatheringPoints = { gathering_bush: { gathering_point_id: 'gathering_bush', display_name: 'gathering_bush', base_gathering_success_rate: 0.6, loot_table_id: 'loot_bush', stamina_cost: 2, tool_required: false }, gathering_grass: { gathering_point_id: 'gathering_grass', display_name: 'gathering_grass', base_gathering_success_rate: 0.6, loot_table_id: 'loot_grass', stamina_cost: 2, tool_required: false } };
    var defaultLootTables = { loot_bush: [ { item_id: 'wild_fruit_red', weight: 40, quality_tier: 1 }, { item_id: 'wild_fruit_red', weight: 30, quality_tier: 2 }, { item_id: 'wild_fruit_purple', weight: 25, quality_tier: 2 }, { item_id: 'wild_fruit_yellow', weight: 15, quality_tier: 3 }, { item_id: 'wild_fruit_purple', weight: 10, quality_tier: 4 }, { item_id: 'wild_fruit_yellow', weight: 5, quality_tier: 5 }, { item_id: 'wild_fruit_red', weight: 2, quality_tier: 6 } ], loot_grass: [ { item_id: 'herb_green', weight: 40, quality_tier: 1 }, { item_id: 'herb_green', weight: 30, quality_tier: 2 }, { item_id: 'herb_bitter', weight: 25, quality_tier: 2 }, { item_id: 'herb_sweet', weight: 15, quality_tier: 3 }, { item_id: 'herb_bitter', weight: 10, quality_tier: 4 }, { item_id: 'herb_sweet', weight: 5, quality_tier: 5 }, { item_id: 'herb_green', weight: 2, quality_tier: 6 } ] };
    var defaultItems = { wild_fruit_red: { item_id: 'wild_fruit_red', name: 'wild_fruit_red', weight_kg: 0.1 }, wild_fruit_purple: { item_id: 'wild_fruit_purple', name: 'wild_fruit_purple', weight_kg: 0.1 }, wild_fruit_yellow: { item_id: 'wild_fruit_yellow', name: 'wild_fruit_yellow', weight_kg: 0.1 }, herb_green: { item_id: 'herb_green', name: 'herb_green', weight_kg: 0.1 }, herb_bitter: { item_id: 'herb_bitter', name: 'herb_bitter', weight_kg: 0.1 }, herb_sweet: { item_id: 'herb_sweet', name: 'herb_sweet', weight_kg: 0.1 } };

    var EQUIP_SLOT_LABELS = { head: 'equip.slot.head', clothing: 'equip.slot.clothing', vest: 'equip.slot.vest', backpack: 'equip.slot.backpack', weapon_left: 'equip.slot.weapon_left', weapon_right: 'equip.slot.weapon_right', glove_left: 'equip.slot.glove_left', glove_right: 'equip.slot.glove_right', shoe_left: 'equip.slot.shoe_left', shoe_right: 'equip.slot.shoe_right', ring_left: 'equip.slot.ring_left', ring_right: 'equip.slot.ring_right', earring_left: 'equip.slot.earring_left', earring_right: 'equip.slot.earring_right', necklace: 'equip.slot.necklace' };
    var BODY_PART_IDS = ['head', 'chest', 'belly', 'lhand', 'rhand', 'lfoot', 'rfoot'];
    var BODY_PART_LABELS = { head: 'body.part.head', chest: 'body.part.chest', belly: 'body.part.belly', lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };
    var ARM_ACTION_TAGS = ['combat.action.punch', 'combat.action.push_palm', 'combat.action.finger_jab'];
    var FOOT_ACTION_TAGS = ['combat.action.snap_kick', 'combat.action.stomp', 'combat.action.toe_kick'];
    var COMBAT_LIMB_IDS = ['lhand', 'rhand', 'lfoot', 'rfoot'];
    var limbActionTags = {
        lhand: ARM_ACTION_TAGS.slice(),
        rhand: ARM_ACTION_TAGS.slice(),
        lfoot: FOOT_ACTION_TAGS.slice(),
        rfoot: FOOT_ACTION_TAGS.slice()
    };

    var tooltipEl = null;
    var tooltipHideTimer = null;
    function showItemTooltip(html, anchorEl) {
        if (!tooltipEl) tooltipEl = document.getElementById('item-tooltip');
        if (!tooltipEl || !html) return;
        tooltipEl.innerHTML = html;
        tooltipEl.style.left = '-9999px';
        tooltipEl.style.top = '0';
        tooltipEl.classList.add('show');
        if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
        requestAnimationFrame(function () {
            var rect = anchorEl.getBoundingClientRect();
            var tr = tooltipEl.getBoundingClientRect();
            var tw = tr.width || 220;
            var th = tr.height || 100;
            var pad = 12;
            var left = rect.right + pad;
            var top = rect.top;
            if (left + tw > window.innerWidth - pad) left = rect.left - tw - pad;
            if (left < pad) left = pad;
            if (top + th > window.innerHeight - pad) top = window.innerHeight - th - pad;
            if (top < pad) top = pad;
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
        });
    }
    function hideItemTooltip() {
        if (!tooltipEl) tooltipEl = document.getElementById('item-tooltip');
        if (tooltipEl) tooltipEl.classList.remove('show');
    }

    function formatItemAttributes(tpl, inst) {
        if (!tpl) return '';
        var lines = [];
        if (tpl.weight_kg != null) lines.push(ui('item.attr.weight', { v: tpl.weight_kg }));
        if (tpl.pocket_slots != null) lines.push(ui('item.attr.pocket_slots', { v: tpl.pocket_slots }));
        if (tpl.vest_slots != null) lines.push(ui('item.attr.vest_slots', { v: tpl.vest_slots }));
        if (tpl.backpack_slots != null) lines.push(ui('item.attr.backpack_slots', { v: tpl.backpack_slots }));
        if (tpl.backpack_weight_factor != null) lines.push(ui('item.attr.backpack_weight_factor', { v: Math.round(tpl.backpack_weight_factor * 100) }));
        if (tpl.damage_reduce_slash_pct != null || tpl.damage_reduce_pierce_pct != null || tpl.damage_reduce_blunt_pct != null) {
            var dr = [];
            if (tpl.damage_reduce_slash_pct != null && tpl.damage_reduce_slash_pct > 0) dr.push(ui('item.attr.dr.slash', { v: Math.round(tpl.damage_reduce_slash_pct * 100) }));
            if (tpl.damage_reduce_pierce_pct != null && tpl.damage_reduce_pierce_pct > 0) dr.push(ui('item.attr.dr.pierce', { v: Math.round(tpl.damage_reduce_pierce_pct * 100) }));
            if (tpl.damage_reduce_blunt_pct != null && tpl.damage_reduce_blunt_pct > 0) dr.push(ui('item.attr.dr.blunt', { v: Math.round(tpl.damage_reduce_blunt_pct * 100) }));
            if (dr.length) lines.push(ui('item.attr.damage_reduce', { v: dr.join(ui('punct.join.dot')) }));
        }
        if (tpl.skill_coef != null) lines.push(ui('item.attr.skill_coef', { v: tpl.skill_coef }));
        if (tpl.req_innate_jingu != null) lines.push(ui('item.attr.req_innate_jingu', { v: tpl.req_innate_jingu }));
        if (tpl.enchant_slots != null) lines.push(ui('item.attr.enchant_slots', { v: tpl.enchant_slots }));
        var q = (inst && inst.quality_tier != null) ? inst.quality_tier : tpl.quality_tier;
        if (q != null && IE && IE.QUALITY_NAMES) lines.push(ui('item.attr.quality', { v: (IE.QUALITY_NAMES[q] || ui('common.dash')) }));
        return lines.length ? lines.join('\n') : '';
    }
    function buildItemTooltipHtml(name, desc, attrs) {
        var html = '<div class="tooltip-name">' + (name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        if (desc) html += '<div class="tooltip-desc">' + (desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        if (attrs) html += '<div class="tooltip-attrs">' + (attrs || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        return html;
    }

    function buildItemFieldRulesHtmlAppend(itemId, tpl, inst, character) {
        try {
            if (!window.ItemFieldDisplayRules || typeof window.ItemFieldDisplayRules.renderFieldBlocksHtml !== 'function') return '';
            return window.ItemFieldDisplayRules.renderFieldBlocksHtml({
                itemId: itemId,
                tpl: tpl,
                inst: inst,
                character: character,
                buffLookup: function (buffId) {
                    if (!window.BuffSystem || typeof window.BuffSystem.getBuffTemplate !== 'function') return null;
                    try {
                        var bt = window.BuffSystem.getBuffTemplate(buffId);
                        if (!bt) return null;
                        return { name: bt.name || '', buff_id: bt.buff_id || buffId };
                    } catch (eB) { return null; }
                }
            }) || '';
        } catch (e) { return ''; }
    }

    function buildItemTooltipHtmlForTemplate(itemId, tpl, inst, character) {
        var tier = IE && IE.getItemDisplayTier ? IE.getItemDisplayTier(itemId, character) : 0;
        var name = tpl && IE && IE.getDisplayName ? IE.getDisplayName(tpl, tier, character) : String(itemId || '');
        var desc = tpl && IE && IE.getDisplayDesc ? IE.getDisplayDesc(tpl, tier, character) : '';
        // 默认只显示“名称 + 描述”，其它信息统一走 ItemInfoModules 配置。
        var html = buildItemTooltipHtml(name, desc, '');
        try {
            if (window.ItemInfoModules && typeof window.ItemInfoModules.renderTooltipModulesHtml === 'function') {
                var modulesHtml = window.ItemInfoModules.renderTooltipModulesHtml({
                    itemId: itemId,
                    tpl: tpl,
                    character: character
                });
                if (modulesHtml) html += modulesHtml;
            }
        } catch (e) { /* ignore */ }
        var fieldRulesHtml = buildItemFieldRulesHtmlAppend(itemId, tpl, inst, character);
        if (fieldRulesHtml) html += fieldRulesHtml;
        return html;
    }

    function loadConfig() {
        var base = 'data/';
        return Promise.all([
            fetch(base + 'ui_text_zhCN.json').then(function (r) { return r.ok ? r.json() : null; }),
            fetch(base + 'gathering_points.json').then(function (r) { return r.ok ? r.json() : defaultGatheringPoints; }).catch(function () { return defaultGatheringPoints; }),
            fetch(base + 'loot_tables.json').then(function (r) { return r.ok ? r.json() : defaultLootTables; }).catch(function () { return defaultLootTables; }),
            fetch(base + 'items.json').then(function (r) { return r.ok ? r.json() : defaultItems; }).catch(function () { return defaultItems; }),
            fetch(base + 'survival-config.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'equipment.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'enchant.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'default_equipment.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'combat-skills.json').then(function (r) { return r.ok ? r.json() : { constants: {}, categories: [], skills: {} }; }).catch(function () { return { constants: {}, categories: [], skills: {} }; }),
            fetch(base + 'combat-pipeline.json').then(function (r) { return r.ok ? r.json() : { pipelines: {} }; }).catch(function () { return { pipelines: {} }; }),
            fetch(base + 'move-variants.json').then(function (r) { return r.ok ? r.json() : { variants: {} }; }).catch(function () { return { variants: {} }; }),
            fetch(base + 'post-effects.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
            fetch(base + 'survival-skills.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'gathering_point_instances.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'combat-enemies.json').then(function (r) { return r.ok ? r.json() : { enemies: {} }; }).catch(function () { return { enemies: {} }; }),
            fetch(base + 'cooking-methods.json').then(function (r) { return r.ok ? r.json() : { methods: {} }; }).catch(function () { return { methods: {} }; }),
            fetch(base + 'cooking-recipes.json').then(function (r) { return r.ok ? r.json() : { recipes: [] }; }).catch(function () { return { recipes: [] }; }),
            fetch(base + 'cooking-system-config.csv').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }),
            fetch(base + 'recipes.json').then(function (r) { return r.ok ? r.json() : { recipes: {} }; }).catch(function () { return { recipes: {} }; }),
            fetch(base + 'recipe-methods.json').then(function (r) { return r.ok ? r.json() : { methods: {} }; }).catch(function () { return { methods: {} }; }),
            fetch(base + 'life-skill-recipe-interfaces.json').then(function (r) { return r.ok ? r.json() : { interfaces: {} }; }).catch(function () { return { interfaces: {} }; }),
            fetch(base + 'item-info-modules.json').then(function (r) { return r.ok ? r.json() : { module_sets: {} }; }).catch(function () { return { module_sets: {} }; }),
            fetch(base + 'item-field-display-rules.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch(base + 'compost-events.json').then(function (r) { return r.ok ? r.json() : { events: {} }; }).catch(function () { return { events: {} }; }),
            fetch(base + 'compost-event-actions.csv').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
        ]).then(function (arr) {
            if (!arr[0]) throw new Error('[SceneApp] ui_text_zhCN.json missing');
            if (!window.UIText || typeof window.UIText.setDict !== 'function') throw new Error('[SceneApp] UIText module missing');
            window.UIText.setDict(arr[0]);
            window.UIText.applyDom(document);
            G.setConfig({
                gathering_points: arr[1],
                loot_tables: arr[2],
                items: arr[3],
                gathering_point_instances: arr[13] || null
            });
            if (window.Survival) window.Survival.setConfig(arr[4]);
            var survCfg = arr[4] || {};
            var idleSec = Number(survCfg.idle_seconds_per_tick);
            if (isFinite(idleSec) && idleSec > 0) {
                idleTickMs = Math.max(200, Math.round(idleSec * 1000));
            } else {
                idleTickMs = 3000;
            }
            if (window.ProductionQuality && typeof window.ProductionQuality.setConfig === 'function') {
                window.ProductionQuality.setConfig(survCfg);
            }
            var starterEquipFallback = {
                clothing: 'eq_clothing_commute',
                vest: 'eq_vest_hoodie',
                shoe_left: 'eq_shoe_left_sport',
                shoe_right: 'eq_shoe_right_sport'
            };
            if (window.CombatSkills && arr[8]) window.CombatSkills.setConfig(arr[8]);
            if (window.CombatPipeline && arr[9]) window.CombatPipeline.setConfig(arr[9]);
            if (window.CombatVariants && arr[10]) window.CombatVariants.setTable(arr[10]);
            if (window.PostEffects && arr[11]) window.PostEffects.setTable(arr[11]);
            if (window.SurvivalSkills && typeof window.SurvivalSkills.setTable === 'function' && arr[12]) {
                window.SurvivalSkills.setTable(arr[12]);
            }
            if (window.CombatEnemies && arr[14]) window.CombatEnemies.setTable(arr[14]);
            cookingMethods = (arr[15] && arr[15].methods && typeof arr[15].methods === 'object') ? arr[15].methods : {};
            cookingRecipes = (arr[16] && Array.isArray(arr[16].recipes)) ? arr[16].recipes : [];
            pharmacyMethods = (arr[19] && arr[19].methods && typeof arr[19].methods === 'object') ? arr[19].methods : {};
            pharmacyRecipes = (arr[18] && arr[18].recipes && typeof arr[18].recipes === 'object') ? Object.keys(arr[18].recipes).map(function(k){return arr[18].recipes[k];}) : [];
            var cookCfgParsed = parseCookingSystemConfigCsv(arr[17] != null ? String(arr[17]) : '');
            cookingFailureItemId = cookCfgParsed.cooking_global_failure_item_id || 'food_cooking_fail_generic';
            cookingTempStationLifetimeTicks = Math.max(1, Math.floor(Number(cookCfgParsed.cooking_temp_station_lifetime_ticks) || 50));
            if (window.RecipeSchema && typeof window.RecipeSchema.validateRecipeTables === 'function') {
                try {
                    var schemaReport = window.RecipeSchema.validateRecipeTables(arr[18], arr[19], arr[20], {});
                    if (window.SceneCtx) window.SceneCtx.recipe_schema_validation_report = schemaReport || { errors: [], warnings: [] };
                    var schemaErrors = (schemaReport && Array.isArray(schemaReport.errors)) ? schemaReport.errors : [];
                    var schemaWarnings = (schemaReport && Array.isArray(schemaReport.warnings)) ? schemaReport.warnings : [];
                    if (schemaErrors.length > 0) {
                        console.error('[RecipeSchema] validation failed:', {
                            error_count: schemaErrors.length,
                            warning_count: schemaWarnings.length
                        });
                        schemaErrors.forEach(function (e, idx) {
                            console.error('[RecipeSchema][Error#' + (idx + 1) + ']', e);
                        });
                    } else if (schemaWarnings.length > 0) {
                        console.warn('[RecipeSchema] validation warnings:', {
                            error_count: 0,
                            warning_count: schemaWarnings.length
                        });
                        schemaWarnings.forEach(function (w, idx) {
                            console.warn('[RecipeSchema][Warn#' + (idx + 1) + ']', w);
                        });
                    }
                } catch (eSchema) {
                    console.error('[RecipeSchema] validator runtime error:', eSchema);
                    if (window.SceneCtx) {
                        window.SceneCtx.recipe_schema_validation_report = {
                            errors: [{
                                entry_type: 'runtime',
                                id: 'recipe_schema_validator',
                                error_code: 'VALIDATOR_RUNTIME_ERROR',
                                message: (eSchema && eSchema.message) ? String(eSchema.message) : String(eSchema)
                            }],
                            warnings: []
                        };
                    }
                }
            }
            if (window.RecipeSystem && typeof window.RecipeSystem.setTables === 'function') {
                window.RecipeSystem.setTables(arr[18], arr[19], arr[20]);
                registerCookingRecipeProcessorIfNeeded();
                if (typeof registerPharmacyRecipeProcessorIfNeeded === 'function') {
                    registerPharmacyRecipeProcessorIfNeeded();
                }
            }
            if (window.ItemInfoModules && typeof window.ItemInfoModules.setTable === 'function') {
                window.ItemInfoModules.setTable(arr[21]);
            }
            if (window.ItemFieldDisplayRules && typeof window.ItemFieldDisplayRules.setTable === 'function') {
                window.ItemFieldDisplayRules.setTable(arr[22] && typeof arr[22] === 'object' ? arr[22] : null);
            }
            if (window.CompostSystem) {
                if (typeof window.CompostSystem.setEventsTable === 'function') {
                    window.CompostSystem.setEventsTable(arr[23]);
                }
                compostEventActionDisplayById = parseCompostEventActionsCsv(arr[24] != null ? String(arr[24]) : '');
                if (typeof window.CompostSystem.setConfig === 'function') {
                    window.CompostSystem.setConfig({
                        aerobic_duration_ticks: 288,
                        anaerobic_duration_ticks: 1008
                    });
                }
                if (typeof window.CompostSystem.setHooks === 'function') {
                    window.CompostSystem.setHooks({
                        on_batch_started: function () { addCompostProficiencyForAction('compost_batch_started'); },
                        on_window_interacted: function () { addCompostProficiencyForAction('compost_window_interacted'); }
                    });
                }
            }
            renderRecipeSchemaValidationDebugList();
            var defEqFetched = (arr[7] && typeof arr[7] === 'object') ? arr[7] : {};
            var defaultEquipMerged = {};
            var sk;
            for (sk in starterEquipFallback) {
                if (starterEquipFallback.hasOwnProperty(sk)) defaultEquipMerged[sk] = starterEquipFallback[sk];
            }
            for (sk in defEqFetched) {
                if (!defEqFetched.hasOwnProperty(sk) || sk === '_comment' || !defEqFetched[sk]) continue;
                if (IE.EQUIP_SLOT_IDS.indexOf(sk) >= 0) defaultEquipMerged[sk] = defEqFetched[sk];
            }
            IE.setConfig({
                equipment: arr[5],
                items: arr[3],
                enchant: arr[6],
                default_equipment: defaultEquipMerged,
                item_display_tier_threshold_1: survCfg.item_display_tier_threshold_1,
                item_display_tier_threshold_2: survCfg.item_display_tier_threshold_2
            });
            IE.initNewGame();
            if (window.CharacterAttributes) {
                window.CharacterAttributes.setConfig(survCfg);
                window.CharacterAttributes.setState(window.CharacterAttributes.getDefaultState());
                window.CharacterAttributes.recalcCharacterStats({
                    getEquipmentState: function () { return IE.getState().equipment; },
                    getSkillsState: function () { return IE.getState().skills; },
                    getItemTemplate: IE.getItemTemplate,
                    getEnchantEntry: IE.getEnchantEntry,
                    getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
                });
            }
            if (window.Survival && window.Survival.setCharacterCallbacks && window.CharacterAttributes) {
                window.Survival.setCharacterCallbacks({
                    getBreathActual: window.CharacterAttributes.getBreathActual,
                    getNingqiBonus: function () {
                        var lv = (IE && typeof IE.getSkillLevel === 'function') ? (IE.getSkillLevel('survival_ningqi') || 0) : 0;
                        var per = Number(survCfg.ningqi_regen_bonus_per_level);
                        if (!isFinite(per) || per < 0) per = 0.01;
                        return Math.max(0, lv) * per;
                    }
                });
            }
        });
    }

    var CREATION_ATTR_LABELS = { jingu: 'status.attr.jingu', flexibility: 'status.attr.flexibility', breath: 'status.attr.breath', dexterity: 'status.attr.dexterity', focus: 'status.attr.focus' };
    var creationInnate = { jingu: 10, flexibility: 10, breath: 10, dexterity: 10, focus: 10 };
    var CREATION_ATTR_MAX = 29;
    var CREATION_HEIGHT_MIN = 140;
    var CREATION_HEIGHT_MAX = 210;
    var CREATION_HEIGHT_DEFAULT = 178;
    var CREATION_TARGET_BMI = 22;

    function clampCreationHeightCm(raw) {
        var n = Math.round(Number(raw) || 0);
        if (!isFinite(n) || n <= 0) n = CREATION_HEIGHT_DEFAULT;
        if (n < CREATION_HEIGHT_MIN) n = CREATION_HEIGHT_MIN;
        if (n > CREATION_HEIGHT_MAX) n = CREATION_HEIGHT_MAX;
        return n;
    }

    function computeCreationDefaultWeightKg(heightCm) {
        var h = clampCreationHeightCm(heightCm) / 100;
        return Math.round(CREATION_TARGET_BMI * h * h * 10) / 10;
    }

    function getCreationInnateSum() {
        return creationInnate.jingu + creationInnate.flexibility + creationInnate.breath + creationInnate.dexterity + creationInnate.focus;
    }

    function getCreationFreePoints() {
        var sum = getCreationInnateSum();
        return Math.max(0, 100 - sum);
    }

    function updateCreationPointsDisplay() {
        var el = document.getElementById('creation-points');
        if (!el) return;
        var free = getCreationFreePoints();
        el.textContent = ui('creation.points.left', { free: free });
        el.classList.remove('ok');
        if (free === 0) el.classList.add('ok');
    }

    function updateCreationConfirmButton() {
        var btn = document.getElementById('btn-confirm-creation');
        var nameEl = document.getElementById('creation-name');
        if (!btn) return;
        var nameOk = nameEl && String(nameEl.value || '').trim().length > 0;
        btn.disabled = !nameOk;
    }

    function randomDistributeCreationRemainingPoints() {
        var attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
        var remaining = getCreationFreePoints();
        while (remaining > 0) {
            var candidates = attrIds.filter(function (id) {
                return creationInnate[id] < CREATION_ATTR_MAX;
            });
            if (!candidates.length) break;
            var pick = candidates[Math.floor(Math.random() * candidates.length)];
            creationInnate[pick]++;
            remaining--;
        }
    }

    function initCreationUI() {
        var CA = window.CharacterAttributes;
        if (!CA) return;
        var state = CA.getState();
        creationInnate = {
            jingu: state.innate.jingu != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.jingu)) : 1,
            flexibility: state.innate.flexibility != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.flexibility)) : 1,
            breath: state.innate.breath != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.breath)) : 1,
            dexterity: state.innate.dexterity != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.dexterity)) : 1,
            focus: state.innate.focus != null ? Math.min(CREATION_ATTR_MAX, Math.max(0, state.innate.focus)) : 1
        };
        var container = document.getElementById('creation-attr-rows');
        if (!container) return;
        container.innerHTML = '';
        var attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
        var creationRowControls = [];
        function refreshCreationAllRows() {
            var sum = getCreationInnateSum();
            creationRowControls.forEach(function (r) {
                r.valueSpan.textContent = creationInnate[r.attrId];
                r.btnMinus.disabled = creationInnate[r.attrId] <= 0;
                r.btnPlus.disabled = creationInnate[r.attrId] >= CREATION_ATTR_MAX || sum >= 100;
            });
            var ids = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
            ids.forEach(function (id) {
                var el = document.getElementById('status-attr-' + id);
                if (el) {
                    var aq = CA.getAcquiredAttr ? CA.getAcquiredAttr(id) : 0;
                    var total = creationInnate[id] + aq;
                    el.textContent = aq ? creationInnate[id] + '+' + aq + '=' + total : String(total);
                }
            });
            updateCreationPointsDisplay();
            updateCreationConfirmButton();
        }
        attrIds.forEach(function (attrId) {
            var row = document.createElement('div');
            row.className = 'attr-row';
            var label = document.createElement('span');
            label.className = 'attr-label';
            label.textContent = ui(CREATION_ATTR_LABELS[attrId]);
            var controls = document.createElement('div');
            controls.className = 'attr-controls';
            var btnMinus = document.createElement('button');
            btnMinus.type = 'button';
            btnMinus.className = 'attr-btn';
            btnMinus.textContent = '−';
            btnMinus.setAttribute('aria-label', ui('creation.attr.minus'));
            var valueSpan = document.createElement('span');
            valueSpan.className = 'attr-value';
            valueSpan.textContent = creationInnate[attrId];
            var btnPlus = document.createElement('button');
            btnPlus.type = 'button';
            btnPlus.className = 'attr-btn';
            btnPlus.textContent = '+';
            btnPlus.setAttribute('aria-label', ui('creation.attr.plus'));
            creationRowControls.push({ attrId: attrId, valueSpan: valueSpan, btnMinus: btnMinus, btnPlus: btnPlus });
            btnMinus.onclick = function () {
                if (creationInnate[attrId] > 0) {
                    creationInnate[attrId]--;
                    refreshCreationAllRows();
                }
            };
            btnPlus.onclick = function () {
                var s = getCreationInnateSum();
                if (creationInnate[attrId] < CREATION_ATTR_MAX && s < 100) {
                    creationInnate[attrId]++;
                    refreshCreationAllRows();
                }
            };
            controls.appendChild(btnMinus);
            controls.appendChild(valueSpan);
            controls.appendChild(btnPlus);
            row.appendChild(label);
            row.appendChild(controls);
            container.appendChild(row);
        });
        refreshCreationAllRows();

        var nameEl = document.getElementById('creation-name');
        if (nameEl) nameEl.value = '';
        if (nameEl && !nameEl.__sceneAppCreationInputBound) {
            nameEl.__sceneAppCreationInputBound = true;
            nameEl.addEventListener('input', updateCreationConfirmButton);
        }
        var heightEl = document.getElementById('creation-height');
        if (heightEl) {
            var cfgDefaultHeight = CREATION_HEIGHT_DEFAULT;
            if (window.Survival && typeof window.Survival.getConfigValue === 'function') {
                cfgDefaultHeight = clampCreationHeightCm(window.Survival.getConfigValue('height_cm_default', CREATION_HEIGHT_DEFAULT));
            }
            heightEl.value = String(cfgDefaultHeight);
            if (!heightEl.__sceneAppCreationInputBound) {
                heightEl.__sceneAppCreationInputBound = true;
                heightEl.addEventListener('change', function () {
                    heightEl.value = String(clampCreationHeightCm(heightEl.value));
                });
            }
        }
        updateCreationConfirmButton();
        var btnConfirm = document.getElementById('btn-confirm-creation');
        if (btnConfirm && !btnConfirm.__sceneAppCreationConfirmBound) {
            btnConfirm.__sceneAppCreationConfirmBound = true;
            btnConfirm.onclick = function () {
            if (btnConfirm.disabled) return;
            var name = (nameEl && nameEl.value) ? String(nameEl.value).trim() : '';
            if (!name) return;
            if (getCreationFreePoints() > 0) {
                randomDistributeCreationRemainingPoints();
                refreshCreationAllRows();
                if (window.GameLog) window.GameLog.log(ui('log.system.creation.points.auto'), 'system');
            }
            if (typeof IE.initNewGame === 'function') {
                IE.initNewGame();
                if (window.GameLog) window.GameLog.log(ui('log.system.starter.equip'), 'system');
            }
            resetCookingStateForNewCharacter();
            var handEl = document.querySelector('input[name="creation-hand"]:checked');
            var legEl = document.querySelector('input[name="creation-leg"]:checked');
            var genderEl = document.querySelector('input[name="creation-gender"]:checked');
            var heightEl = document.getElementById('creation-height');
            var heightCm = clampCreationHeightCm(heightEl && heightEl.value != null ? heightEl.value : CREATION_HEIGHT_DEFAULT);
            var initWeightKg = computeCreationDefaultWeightKg(heightCm);
            var gender = (genderEl && genderEl.value === 'female') ? 'female' : 'male';
            var prevHidden = [];
            try {
                var pst = CA.getState();
                if (pst && Array.isArray(pst.hidden_epithets)) prevHidden = pst.hidden_epithets.slice();
            } catch (eH) { prevHidden = []; }
            if (typeof CA.innateAllTwentyForUselessPerson === 'function' && CA.innateAllTwentyForUselessPerson(creationInnate)) {
                var uselessLabel = CA.HIDDEN_EPITHET_USELESS || '无用之人';
                if (prevHidden.indexOf(uselessLabel) < 0) prevHidden.push(uselessLabel);
            }
            CA.setState({
                characterName: name,
                characterGender: gender,
                character_creation_completed: true,
                innate: { jingu: creationInnate.jingu, flexibility: creationInnate.flexibility, breath: creationInnate.breath, dexterity: creationInnate.dexterity, focus: creationInnate.focus },
                dominant_hand: (handEl && handEl.value === 'left') ? 'left' : 'right',
                dominant_leg: (legEl && legEl.value === 'left') ? 'left' : 'right',
                hidden_epithets: prevHidden
            });
            if (window.Survival && window.Survival.setState) {
                window.Survival.setState({
                    gender_value: gender === 'female' ? 100 : 0,
                    height_cm: heightCm,
                    weight_kg: initWeightKg
                });
            }
            CA.recalcCharacterStats({
                getEquipmentState: function () { return IE.getState().equipment; },
                getSkillsState: function () { return IE.getState().skills; },
                getItemTemplate: IE.getItemTemplate,
                getEnchantEntry: IE.getEnchantEntry,
                getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
            });
            if (window.Survival && typeof window.Survival.initBattleResourcesFull === 'function') {
                window.Survival.initBattleResourcesFull();
            }
            hideCreationOverlay();
            updateRoleNameFromCharacter();
            syncIntroShellUi();
            if (window.GameLog) window.GameLog.log(ui('log.system.creation.done', { name: name }), 'system');
            render();
        };
        }
    }

    function hideCreationOverlay() {
        var el = document.getElementById('character-creation-overlay');
        if (el) el.classList.add('hidden');
    }

    function showCreationOverlay() {
        var el = document.getElementById('character-creation-overlay');
        if (el) el.classList.remove('hidden');
    }

    function openCharacterCreationAfterIntro() {
        showCreationOverlay();
        initCreationUI();
    }

    function updateRoleNameFromCharacter() {
        var el = document.getElementById('status-role-name');
        if (!el) return;
        var name = window.CharacterAttributes && window.CharacterAttributes.getCharacterName();
        el.textContent = (name && name.length) ? name : ui('status.role.default');
        var gEl = document.getElementById('status-gender-line');
        if (gEl && window.CharacterAttributes && window.CharacterAttributes.getCharacterGenderLabel) {
            gEl.textContent = ui('status.gender.prefix', { gender: window.CharacterAttributes.getCharacterGenderLabel() });
        }
    }

    function render() {
        refreshRenderProfile();
        if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') {
            window.SceneRenderer.render();
        }
    }
    window.addEventListener('resize', function () {
        render();
    });

    // NOTE: bootstrapMapsFromJson 会触发 render()，而此时 SceneApp.init 里还未完成 ui_text_zhCN.json 的加载。
    // 放到 init() 的 loadConfig 成功后再执行，避免出现 UIText 未加载导致的崩溃。

    function setTimeHudVisible(visible) {
        timeHudVisible = (visible !== false);
        var wrap = document.getElementById('top-hud');
        if (wrap) wrap.style.display = timeHudVisible ? '' : 'none';
    }

    function isTimeHudVisible() {
        return !!timeHudVisible;
    }

    window.HUD = window.HUD || {};
    window.HUD.setTimeHudVisible = setTimeHudVisible;
    window.HUD.isTimeHudVisible = isTimeHudVisible;

    document.addEventListener('hud:time', function (ev) {
        var v = ev && ev.detail ? ev.detail.visible : undefined;
        if (v === undefined) return;
        setTimeHudVisible(!!v);
    });

    function getSatietyLabel(zone) {
        var labels = { normal: 'survival.satiety.normal', mild: 'survival.satiety.mild', moderate: 'survival.satiety.moderate', severe: 'survival.satiety.severe', starvation: 'survival.satiety.starvation' };
        return ui(labels[zone] || 'common.dash');
    }
    function getThirstLabel(thirst, normalMin) {
        normalMin = normalMin != null ? normalMin : 60;
        if (thirst >= normalMin) return ui('survival.thirst.normal');
        if (thirst > 0) return ui('survival.thirst.thirsty');
        return ui('survival.thirst.dehydrated');
    }
    function updateLimbBlock() {
        var container = document.getElementById('limb-rows');
        if (!container || !BODY_PART_IDS || !BODY_PART_LABELS) return;
        var CA0 = window.CharacterAttributes;
        container.innerHTML = '';
        for (var i = 0; i < BODY_PART_IDS.length; i++) {
            var partId = BODY_PART_IDS[i];
                var labelKey = BODY_PART_LABELS[partId] != null ? BODY_PART_LABELS[partId] : partId;
                var label = ui(labelKey);
            var destroyKey = partId === 'belly' ? 'abdomen' : partId;
            var statusCell = ui('body.part.status.ok');
            if (CA0 && typeof CA0.getPartDestroy === 'function' && typeof CA0.getBodyPartDestroyMax === 'function') {
                var showD = destroyKey === 'head' || destroyKey === 'chest' || destroyKey === 'abdomen' || COMBAT_LIMB_IDS.indexOf(partId) >= 0;
                if (showD) {
                    var curD = CA0.getPartDestroy(destroyKey);
                    var maxD = CA0.getBodyPartDestroyMax(destroyKey);
                    statusCell = ui('body.part.destroy.fmt', { cur: String(curD), max: String(maxD) });
                }
            }
            var row = document.createElement('div');
            row.className = 'limb-row';
            row.innerHTML = '<div class="row"><span>' + (label.replace(/</g, '&lt;')) + '</span><span id="limb-' + partId + '">' + statusCell + '</span></div>';
            (function (pid, partLabel) {
                row.addEventListener('mouseenter', function () {
                    var statusEl = document.getElementById('limb-' + pid);
                    var statusText = statusEl ? statusEl.textContent : '—';
                    var esc = function (s) { return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
                    var html = '<div class="tooltip-name">' + esc(partLabel) + '</div>';
                    html += '<div class="tooltip-desc">' + ui('tooltip.status', { v: esc(statusText) }).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
                    if (COMBAT_LIMB_IDS.indexOf(pid) >= 0) {
                        var arr = (window.getLimbActionTagLabels ? window.getLimbActionTagLabels(pid) : (limbActionTags[pid] || [])).map(esc);
                        var tagStr = arr.length ? arr.join(ui('punct.join.dot')) : ui('common.dash');
                        html += '<div class="tooltip-attrs">' + ui('tooltip.action.tags', { v: tagStr }).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
                    }
                    showItemTooltip(html, row);
                });
                row.addEventListener('mouseleave', hideItemTooltip);
            })(partId, label);
            container.appendChild(row);
        }
    }
    function getLimbActionTags(limbId) {
        if (!limbActionTags[limbId]) return [];
        return limbActionTags[limbId].slice();
    }

    function getLimbActionTagLabels(limbId) {
        var tags = getLimbActionTags(limbId);
        return tags.map(function (k) {
            try { return ui(k); } catch (e) { return k; }
        });
    }
    function setLimbActionTags(limbId, tags) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0) return;
        limbActionTags[limbId] = Array.isArray(tags) ? tags.slice() : [];
    }
    function addLimbActionTag(limbId, tag) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0 || !tag) return;
        var arr = limbActionTags[limbId];
        if (!arr) limbActionTags[limbId] = [];
        if (limbActionTags[limbId].indexOf(tag) < 0) limbActionTags[limbId].push(tag);
    }
    function removeLimbActionTag(limbId, tag) {
        if (COMBAT_LIMB_IDS.indexOf(limbId) < 0 || !limbActionTags[limbId]) return;
        var i = limbActionTags[limbId].indexOf(tag);
        if (i >= 0) limbActionTags[limbId].splice(i, 1);
    }
    function hasLimbActionTag(limbId, tag) {
        return limbActionTags[limbId] && limbActionTags[limbId].indexOf(tag) >= 0;
    }
    window.getLimbActionTags = getLimbActionTags;
    window.getLimbActionTagLabels = getLimbActionTagLabels;
    window.setLimbActionTags = setLimbActionTags;
    window.addLimbActionTag = addLimbActionTag;
    window.removeLimbActionTag = removeLimbActionTag;
    window.hasLimbActionTag = hasLimbActionTag;
    window.ARM_ACTION_TAGS = ARM_ACTION_TAGS;
    window.FOOT_ACTION_TAGS = FOOT_ACTION_TAGS;
    window.COMBAT_LIMB_IDS = COMBAT_LIMB_IDS;

    var playerActionsSubmenuOpen = false;
    var playerActionsOutsideClickBound = false;

    function hubAdjacentForBreathActions() {
        return !!(window.SceneCtx && typeof window.SceneCtx.hasAdjacentEnemyForCombat === 'function' && window.SceneCtx.hasAdjacentEnemyForCombat());
    }

    var ACTION_BAR_PIN_SLOTS = 4;

    function parseHubQuickBarToken(tok) {
        if (!tok || String(tok).indexOf('hub|') !== 0) return null;
        var parts = String(tok).split('|');
        if (parts.length < 3 || !parts[1] || !parts[2]) return null;
        return { skillId: parts[1], actionId: parts[2] };
    }

    function parseActionQuickBarToken(tok) {
        if (!tok || String(tok).indexOf('action|') !== 0) return null;
        var parts = String(tok).split('|');
        if (parts.length < 2 || !parts[1]) return null;
        return { actionId: parts[1] };
    }

    function getQuickBarPinLabel(skillId, actionId) {
        var CS = window.CombatSkills;
        if (!CS || typeof CS.getSkill !== 'function') return actionId || '—';
        var sk = CS.getSkill(skillId);
        if (!sk || !sk.hub_actions) return actionId || '—';
        var hi;
        for (hi = 0; hi < sk.hub_actions.length; hi++) {
            if (sk.hub_actions[hi].id === actionId) return sk.hub_actions[hi].name || actionId;
        }
        return actionId || '—';
    }

    function pinHubToQuickBar(skillId, actionId) {
        var tok = 'hub|' + skillId + '|' + actionId;
        return pinTokenToQuickBar(tok);
    }

    function pinActionToQuickBar(actionId) {
        var tok = 'action|' + actionId;
        return pinTokenToQuickBar(tok);
    }

    function pinTokenToQuickBar(tok) {
        var slots = window.SceneCtx.getActionBarSlots();
        var i;
        for (i = 0; i < ACTION_BAR_PIN_SLOTS; i++) {
            if (!slots[i]) {
                slots[i] = tok;
                window.SceneCtx.setActionBarSlots(slots);
                if (window.SaveSystem && typeof window.SaveSystem.saveNow === 'function') window.SaveSystem.saveNow();
                showMsg(ui('action.bar.pin.ok'), 'success');
                if (window.SceneRenderer) window.SceneRenderer.render();
                return true;
            }
        }
        showMsg(ui('action.bar.pin.full'), 'warning');
        return false;
    }

    function clearQuickBarPinSlot(slotIndex) {
        var idx = slotIndex | 0;
        if (idx < 0 || idx >= ACTION_BAR_PIN_SLOTS) return;
        var slots = window.SceneCtx.getActionBarSlots();
        if (!slots[idx]) return;
        slots[idx] = null;
        window.SceneCtx.setActionBarSlots(slots);
        if (window.SaveSystem && typeof window.SaveSystem.saveNow === 'function') window.SaveSystem.saveNow();
        showMsg(ui('action.bar.pin.cleared'), 'info');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function executeQuickBarPinnedSlot(slotIndex) {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        var idx = slotIndex | 0;
        var slots = window.SceneCtx.getActionBarSlots();
        var token = slots[idx];
        var parsedAction = parseActionQuickBarToken(token);
        if (parsedAction) {
            if (parsedAction.actionId === 'rest_toggle') {
                setRestingActionActive(!(window.Survival && window.Survival.getState && window.Survival.getState().isResting), { showMsg: true });
                if (window.SceneRenderer) window.SceneRenderer.render();
                updateStatusPanel();
                return;
            }
            showMsg(ui('action.bar.pin.unknown'), 'info');
            return;
        }
        var parsed = parseHubQuickBarToken(token);
        if (!parsed) return;
        var sk = parsed.skillId;
        var act = parsed.actionId;
        var footworkId = 'combat_basic_footwork';
        var breathId = 'combat_basic_breath';
        if (sk === footworkId && act === 'nie_bu') {
            toggleFootworkNieBuModeFromMenu();
            return;
        }
        if (sk === breathId && act === 'tiao_xi_once') {
            if (tiaoXiIdleTimer) stopTiaoXiIdle(false);
            else startTiaoXiIdle();
            if (window.SceneRenderer) window.SceneRenderer.render();
            updateStatusPanel();
            return;
        }
        if (sk === breathId) {
            var CHAx = window.CombatHubActions;
            if (!CHAx || typeof CHAx.tryExecuteHubAction !== 'function') return;
            var rx = CHAx.tryExecuteHubAction(breathId, act, { isBattleContext: hubAdjacentForBreathActions });
            if (!rx.ok) {
                var varsx = {};
                if (rx.cooldown_ticks != null) varsx.ticks = rx.cooldown_ticks;
                showMsg(ui(rx.reason_key, varsx), 'info');
                return;
            }
            if (act === 'diqi_huti') showMsg(ui(rx.reason_key, { shield: rx.shield_value != null ? rx.shield_value : 0 }), 'success');
            else if (act === 'xue_qi_hua_jing') {
                var CAxq = window.CharacterAttributes;
                var limbIdx = rx.limb;
                var limbUiKey2 = limbIdx && BODY_PART_LABELS[limbIdx] ? BODY_PART_LABELS[limbIdx] : null;
                var limbLabel2 = limbUiKey2 ? ui(limbUiKey2) : String(limbIdx || '—');
                var dmaxXq2 = (CAxq && typeof CAxq.getBodyPartDestroyMax === 'function' && limbIdx) ? CAxq.getBodyPartDestroyMax(limbIdx) : 100;
                var curXq2 = (CAxq && typeof CAxq.getLimbDestroy === 'function' && limbIdx) ? CAxq.getLimbDestroy(limbIdx) : 0;
                showMsg(ui('combat.hub.ok.xue_qi.detail', { limb: limbLabel2, cur: String(curXq2), max: String(dmaxXq2) }), 'success');
            } else if (act === 'tu_qi_na_jing') showMsg(ui('combat.hub.ok.tu_qi', { e: rx.energy_gain != null ? rx.energy_gain : 1 }), 'success');
            else if (act === 'tiao_xi_once') showMsg(ui('combat.hub.ok.tiao_xi', { n: rx.diqi_gained != null ? rx.diqi_gained : 0 }), 'success');
            else {
                var hubOkVars2 = {};
                if (rx.qi_li_restored != null) hubOkVars2.n = rx.qi_li_restored;
                showMsg(ui(rx.reason_key || 'combat.hub.ok', hubOkVars2), 'success');
            }
            if (window.SceneRenderer) window.SceneRenderer.render();
            updateStatusPanel();
            return;
        }
        showMsg(ui('action.bar.pin.unknown'), 'info');
    }

    function bindQuickBarPinSlotsOnce() {
        if (bindQuickBarPinSlotsOnce._done) return;
        bindQuickBarPinSlotsOnce._done = true;
        var si;
        for (si = 0; si < ACTION_BAR_PIN_SLOTS; si++) {
            (function (idx) {
                var b = document.getElementById('action-bar-pin-' + idx);
                if (!b) return;
                b.addEventListener('click', function () {
                    executeQuickBarPinnedSlot(idx);
                });
                b.addEventListener('contextmenu', function (e) {
                    e.preventDefault();
                    clearQuickBarPinSlot(idx);
                });
            })(si);
        }
    }

    /** 右侧「动作」菜单：切换蹑步选点（与地图点击 tryFootworkNieBuJump 配套） */
    function toggleFootworkNieBuModeFromMenu() {
        var SKILL_ID = 'combat_basic_footwork';
        var ACTION_ID = 'nie_bu';
        var IE = window.InventoryEquipment;
        if (!IE || !window.SceneCtx) return;
        if (!IE.getSkillLevel || IE.getSkillLevel(SKILL_ID) < 1) {
            showMsg(ui('player.action.niebu.fail.no_skill'), 'info');
            return;
        }
        var hubsNb = IE.getCombatState ? IE.getCombatState().hubs : null;
        if (!hubsNb || hubsNb.footwork !== SKILL_ID) {
            showMsg(ui('player.action.niebu.fail.hub'), 'info');
            return;
        }
        var cdNb = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(SKILL_ID, ACTION_ID) : 0;
        if (cdNb > 0) {
            showMsg(ui('player.action.niebu.fail.cooldown', { ticks: cdNb }), 'info');
            return;
        }
        if (window.SceneCtx.footworkNieBuMode) {
            if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') window.SceneCtx.exitFootworkNieBuMode();
            if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
            return;
        }
        var rNb = 2;
        var CSNb = window.CombatSkills;
        if (CSNb && typeof CSNb.getSkill === 'function') {
            var skNb = CSNb.getSkill(SKILL_ID);
            if (skNb && skNb.hub_actions) {
                var hnb;
                for (hnb = 0; hnb < skNb.hub_actions.length; hnb++) {
                    if (skNb.hub_actions[hnb].id === ACTION_ID && skNb.hub_actions[hnb].leap_radius != null) {
                        rNb = parseInt(skNb.hub_actions[hnb].leap_radius, 10) || 2;
                        break;
                    }
                }
            }
        }
        var stNb = E.getState();
        var mapNb = E.getMap();
        window.SceneCtx.footworkNieBuMode = true;
        window.SceneCtx.nieBuLeapRadius = rNb;
        showMsg(ui('player.action.niebu.hint'), 'info');
        if (mapNb && typeof window.SceneCtx.pushDirtyNieBuRing === 'function') {
            window.SceneCtx.pushDirtyNieBuRing(stNb.x, stNb.y, rNb);
        }
        if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
    }

    function closePlayerActionsSubmenu() {
        var sub = document.getElementById('player-actions-submenu');
        if (!sub) return;
        sub.classList.remove('open');
        sub.setAttribute('aria-hidden', 'true');
        playerActionsSubmenuOpen = false;
    }

    function rebuildPlayerActionsSubmenu(sub) {
        var IE = window.InventoryEquipment;
        var CS = window.CombatSkills;
        var Surv = window.Survival;
        var CHA = window.CombatHubActions;
        sub.innerHTML = '';
        if (!IE) return;
        var breathId = 'combat_basic_breath';
        var footworkId = 'combat_basic_footwork';
        var hubs = IE.getCombatState && IE.getCombatState().hubs ? IE.getCombatState().hubs : {};
        if (Surv && typeof Surv.getState === 'function' && typeof Surv.setResting === 'function') {
            var survState = Surv.getState() || {};
            var isResting = !!survState.isResting;
            var btnRest = document.createElement('button');
            btnRest.type = 'button';
            btnRest.className = 'player-action-item';
            btnRest.setAttribute('role', 'menuitem');
            btnRest.textContent = isResting ? ui('player.action.rest.stop') : ui('player.action.rest.start');
            btnRest.title = isResting ? ui('player.action.rest.stop.hint') : ui('player.action.rest.start.hint');
            btnRest.addEventListener('click', function (ev) {
                ev.stopPropagation();
                setRestingActionActive(!isResting, { showMsg: true });
                closePlayerActionsSubmenu();
                if (window.SceneRenderer) window.SceneRenderer.render();
                updateStatusPanel();
            });
            var restRow = document.createElement('div');
            restRow.className = 'player-action-item-row';
            restRow.appendChild(btnRest);
            var pinRest = document.createElement('button');
            pinRest.type = 'button';
            pinRest.className = 'player-action-pin';
            pinRest.setAttribute('aria-label', ui('action.bar.pin.hint'));
            pinRest.title = ui('action.bar.pin.hint');
            pinRest.textContent = '📌';
            pinRest.addEventListener('click', function (ev) {
                ev.stopPropagation();
                pinActionToQuickBar('rest_toggle');
            });
            restRow.appendChild(pinRest);
            sub.appendChild(restRow);
        }
        var breathLv = typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(breathId) : 0;
        if (CS && breathLv >= 1) {
            var sk = typeof CS.getSkill === 'function' ? CS.getSkill(breathId) : null;
            if (sk && sk.hub_actions) {
                var mounted = hubs.breath === breathId;
                var adj = hubAdjacentForBreathActions();
                var i;
                for (i = 0; i < sk.hub_actions.length; i++) {
                    var ha = sk.hub_actions[i];
                    var ul = ha.unlock_level != null ? ha.unlock_level : 1;
                    if (breathLv < ul) continue;
                    var btnRow = document.createElement('button');
                    btnRow.type = 'button';
                    btnRow.className = 'player-action-item';
                    btnRow.setAttribute('role', 'menuitem');
                    btnRow.textContent = ha.name || ha.id;
                    var cd = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(breathId, ha.id) : 0;
                    var cdCfg = ha.cooldown_ticks != null ? parseInt(ha.cooldown_ticks, 10) : 0;
                    var dis = false;
                    var hint = '';
                    if (ha.id === 'tiao_xi_once' && tiaoXiIdleTimer) {
                        btnRow.textContent = (ha.name || ha.id) + '（挂机中）';
                        hint = '点击停止挂机调息';
                    }
                    if (!mounted) {
                        dis = true;
                        hint = ui('combat.hub.fail.hub_mount');
                    } else if (cd > 0 && isFinite(cdCfg) && cdCfg > 0) {
                        dis = true;
                        hint = ui('combat.hub.fail.cooldown', { ticks: cd });
                        btnRow.textContent = (ha.name || ha.id) + ' · ' + cd + 't';
                    } else if (ha.battle_only && !adj) {
                        dis = true;
                        hint = ui('combat.hub.fail.battle_only');
                    } else if (ha.id === 'diqi_huti' && Surv && typeof Surv.getDiqiShieldRemaining === 'function' && Surv.getDiqiShieldRemaining() > 0) {
                        dis = true;
                        hint = ui('combat.hub.fail.shield_active');
                    }
                    btnRow.disabled = !!dis;
                    if (hint) btnRow.title = hint;
                    var rowWrap = document.createElement('div');
                    rowWrap.className = 'player-action-item-row';
                    (function (actionId) {
                        btnRow.addEventListener('click', function (ev) {
                            ev.stopPropagation();
                            if (actionId === 'tiao_xi_once') {
                                if (tiaoXiIdleTimer) {
                                    stopTiaoXiIdle(false);
                                    closePlayerActionsSubmenu();
                                    if (window.SceneRenderer) window.SceneRenderer.render();
                                    updateStatusPanel();
                                    return;
                                }
                                startTiaoXiIdle();
                                closePlayerActionsSubmenu();
                                if (window.SceneRenderer) window.SceneRenderer.render();
                                updateStatusPanel();
                                return;
                            }
                            if (!CHA || typeof CHA.tryExecuteHubAction !== 'function') return;
                            var r = CHA.tryExecuteHubAction(breathId, actionId, { isBattleContext: hubAdjacentForBreathActions });
                            if (!r.ok) {
                                var vars = {};
                                if (r.cooldown_ticks != null) vars.ticks = r.cooldown_ticks;
                                showMsg(ui(r.reason_key, vars), 'info');
                                return;
                            }
                            if (actionId === 'diqi_huti') showMsg(ui(r.reason_key, { shield: r.shield_value != null ? r.shield_value : 0 }), 'success');
                            else if (actionId === 'xue_qi_hua_jing') {
                                var CAxq = window.CharacterAttributes;
                                var limbId = r.limb;
                                var limbUiKey = limbId && BODY_PART_LABELS[limbId] ? BODY_PART_LABELS[limbId] : null;
                                var limbLabel = limbUiKey ? ui(limbUiKey) : String(limbId || '—');
                                var dmaxXq = (CAxq && typeof CAxq.getBodyPartDestroyMax === 'function' && limbId)
                                    ? CAxq.getBodyPartDestroyMax(limbId) : 100;
                                var curXq = (CAxq && typeof CAxq.getLimbDestroy === 'function' && limbId) ? CAxq.getLimbDestroy(limbId) : 0;
                                showMsg(ui('combat.hub.ok.xue_qi.detail', { limb: limbLabel, cur: String(curXq), max: String(dmaxXq) }), 'success');
                            }
                            else if (actionId === 'tu_qi_na_jing') showMsg(ui('combat.hub.ok.tu_qi', { e: r.energy_gain != null ? r.energy_gain : 1 }), 'success');
                            else if (actionId === 'tiao_xi_once') showMsg(ui('combat.hub.ok.tiao_xi', { n: r.diqi_gained != null ? r.diqi_gained : 0 }), 'success');
                            else {
                                var hubOkVars = {};
                                if (r.qi_li_restored != null) hubOkVars.n = r.qi_li_restored;
                                showMsg(ui(r.reason_key || 'combat.hub.ok', hubOkVars), 'success');
                            }
                            closePlayerActionsSubmenu();
                            if (window.SceneRenderer) window.SceneRenderer.render();
                            updateStatusPanel();
                        });
                    })(ha.id);
                    rowWrap.appendChild(btnRow);
                    var pinBtn = document.createElement('button');
                    pinBtn.type = 'button';
                    pinBtn.className = 'player-action-pin';
                    pinBtn.setAttribute('aria-label', ui('action.bar.pin.hint'));
                    pinBtn.title = ui('action.bar.pin.hint');
                    pinBtn.textContent = '📌';
                    pinBtn.disabled = !!dis;
                    (function (pinEl, actionIdForPin) {
                        pinEl.addEventListener('click', function (ev) {
                            ev.stopPropagation();
                            if (pinEl.disabled) return;
                            pinHubToQuickBar(breathId, actionIdForPin);
                        });
                    })(pinBtn, ha.id);
                    rowWrap.appendChild(pinBtn);
                    sub.appendChild(rowWrap);
                }
            }
        }
        var fwLv = typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(footworkId) : 0;
        if (fwLv >= 1) {
            var nieLabel = ui('player.action.niebu');
            var nieCd = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(footworkId, 'nie_bu') : 0;
            var hubFw = hubs.footwork === footworkId;
            var inNie = window.SceneCtx && window.SceneCtx.footworkNieBuMode;
            var btnNie = document.createElement('button');
            btnNie.type = 'button';
            btnNie.className = 'player-action-item';
            btnNie.setAttribute('role', 'menuitem');
            if (nieCd > 0) {
                btnNie.textContent = ui('player.action.niebu.cooldown', { ticks: nieCd });
                btnNie.disabled = true;
                btnNie.title = ui('player.action.niebu.fail.cooldown', { ticks: nieCd });
            } else if (!hubFw) {
                btnNie.textContent = nieLabel;
                btnNie.disabled = true;
                btnNie.title = ui('player.action.niebu.fail.hub');
            } else {
                btnNie.textContent = inNie ? ui('player.action.niebu.cancel') : nieLabel;
                btnNie.disabled = false;
                btnNie.title = inNie ? ui('player.action.niebu.cancel') : ui('player.action.niebu.hint');
            }
            btnNie.addEventListener('click', function (ev) {
                ev.stopPropagation();
                if (btnNie.disabled) return;
                toggleFootworkNieBuModeFromMenu();
                closePlayerActionsSubmenu();
                if (window.SceneRenderer) window.SceneRenderer.render();
                updateStatusPanel();
            });
            var nieRow = document.createElement('div');
            nieRow.className = 'player-action-item-row';
            nieRow.appendChild(btnNie);
            var pinNie = document.createElement('button');
            pinNie.type = 'button';
            pinNie.className = 'player-action-pin';
            pinNie.setAttribute('aria-label', ui('action.bar.pin.hint'));
            pinNie.title = ui('action.bar.pin.hint');
            pinNie.textContent = '📌';
            pinNie.disabled = !!btnNie.disabled;
            pinNie.addEventListener('click', function (ev) {
                ev.stopPropagation();
                if (pinNie.disabled) return;
                pinHubToQuickBar(footworkId, 'nie_bu');
            });
            nieRow.appendChild(pinNie);
            sub.appendChild(nieRow);
        }
    }

    function openPlayerActionsSubmenu() {
        var sub = document.getElementById('player-actions-submenu');
        if (!sub) return;
        rebuildPlayerActionsSubmenu(sub);
        sub.classList.add('open');
        sub.setAttribute('aria-hidden', 'false');
        playerActionsSubmenuOpen = true;
    }

    function refreshPlayerActionsMenuUi() {
        var wrap = document.getElementById('player-actions-hud-wrap');
        var btn = document.getElementById('btn-player-actions');
        var sub = document.getElementById('player-actions-submenu');
        if (!wrap || !btn || !sub) return;
        var IE = window.InventoryEquipment;
        var CS = window.CombatSkills;
        var breathId = 'combat_basic_breath';
        var cnt = 1; // 常驻动作：休息
        if (IE && typeof IE.getSkillLevel === 'function' && CS && typeof CS.getSkill === 'function' && IE.getSkillLevel(breathId) >= 1) {
            var sk = CS.getSkill(breathId);
            if (sk && sk.hub_actions) {
                var lv = IE.getSkillLevel(breathId);
                var hi;
                for (hi = 0; hi < sk.hub_actions.length; hi++) {
                    var h = sk.hub_actions[hi];
                    var ul = h.unlock_level != null ? h.unlock_level : 1;
                    if (lv >= ul) cnt++;
                }
            }
        }
        if (IE && typeof IE.getSkillLevel === 'function' && IE.getSkillLevel('combat_basic_footwork') >= 1) cnt++;
        wrap.style.display = cnt > 0 ? 'flex' : 'none';
        if (!playerActionsSubmenuOpen) return;
        rebuildPlayerActionsSubmenu(sub);
    }

    function updateStatusPanel(gatherState) {
        var SurvForRest = window.Survival;
        if (SurvForRest && typeof SurvForRest.getState === 'function') {
            var restState = SurvForRest.getState() || {};
            if (restState.isResting) startRestIdleTimer();
            else stopRestIdleTimer();
        } else {
            stopRestIdleTimer();
        }
        function getEnemyDisplayName(enemyId) {
            var id = enemyId != null ? String(enemyId) : '';
            if (!id) return '';
            try {
                if (window.UIText && typeof window.UIText.t === 'function') {
                    return window.UIText.t('enemy.name.' + id.replace(/\./g, '_'));
                }
            } catch (e0) { /* 无专用名时回退 id */ }
            return id;
        }
        function getBuffHudNowTick() {
            var nowTick = 0;
            if (window.GameTime && typeof window.GameTime.getState === 'function') {
                var ts = window.GameTime.getState();
                nowTick = ts && ts.totalTicks != null ? Number(ts.totalTicks) || 0 : 0;
            }
            return nowTick;
        }
        function appendBuffChips(containerEl, ownerArr, nowTick) {
            if (!containerEl) return;
            containerEl.innerHTML = '';
            if (!ownerArr || !ownerArr.length) {
                containerEl.textContent = ui('status.enemy_buffs.none_buff');
                return;
            }
            ownerArr.forEach(function (inst) {
                // 不要因为 stacks<=0/缺失就跳过：用于定位“敌方 buff 不显示”的 owner/stacks 对齐问题
                if (!inst || !inst.buff_id) return;
                var chip = document.createElement('span');
                chip.className = 'buff-chip';
                var buffName = (inst.template && inst.template.name) ? String(inst.template.name) : String(inst.buff_id);
                var stacks = Math.max(0, parseInt(inst.stacks, 10) || 0);
                var expiresAt = parseInt(inst.expires_at_tick, 10);
                var rem = isFinite(expiresAt) ? Math.max(0, expiresAt - nowTick) : null;
                chip.textContent = buffName + '×' + stacks + (rem != null ? ' ' + rem + 't' : '');
                chip.title = buffName + (inst.template && inst.template.desc ? (': ' + inst.template.desc) : '');

                // 鼠标悬浮：复用物品说明的同一套 tooltip（#item-tooltip）
                var buffDesc = inst.template && inst.template.desc ? String(inst.template.desc) : '';
                var attrs = '层数：' + String(stacks);
                if (rem != null) attrs += '\n剩余：' + String(rem) + 't';
                var tipHtml = buildItemTooltipHtml(buffName, buffDesc, attrs);
                chip.addEventListener('mouseenter', function () {
                    showItemTooltip(tipHtml, chip);
                });
                chip.addEventListener('mouseleave', function () {
                    hideItemTooltip();
                });
                containerEl.appendChild(chip);
            });
            if (!containerEl.children.length) containerEl.textContent = ui('status.enemy_buffs.none_buff');
        }
        function renderBuffHud() {
            var hud = document.getElementById('buff-hud');
            var playerEl = document.getElementById('buff-hud-player-chips');
            var enemyEl = document.getElementById('buff-hud-enemy-chips');
            var selfTitle = document.getElementById('buff-hud-self-title');
            var enemyTitle = document.getElementById('buff-hud-enemy-title');
            if (!hud || !playerEl || !enemyEl) return;
            if (!shouldShowBlock('buff_hud')) {
                hud.style.display = 'none';
                return;
            }
            hud.style.display = 'none';
            if (selfTitle) selfTitle.textContent = ui('buff.hud.self');
            var nowTick = getBuffHudNowTick();
            if (!window.BuffSystem || typeof window.BuffSystem.getState !== 'function') {
                playerEl.textContent = ui('status.enemy_buffs.none_buff');
                enemyEl.textContent = ui('status.enemy_buffs.none_buff');
                return;
            }
            var bs = window.BuffSystem.getState() || {};
            var instByOwner = bs.instancesByOwner || {};
            var pArr = Array.isArray(instByOwner.player) ? instByOwner.player : [];
            appendBuffChips(playerEl, pArr, nowTick);
            var targetEnemyId = window.SceneCtx && window.SceneCtx.lastAttackedEnemyId != null
                ? String(window.SceneCtx.lastAttackedEnemyId)
                : '';
            var chosenEnemyId = targetEnemyId;
            var eArr = (chosenEnemyId && Array.isArray(instByOwner[chosenEnemyId]))
                ? instByOwner[chosenEnemyId]
                : [];

            // 兜底：如果上回合敌方没有 buff（可能 ownerId 对不上/尚未记录），则显示“最近一次出现 buff 的敌人”
            if (!eArr || !eArr.length) {
                var bestOwnerId = '';
                var bestTick = -1;
                var ownerKeys = Object.keys(instByOwner || {});
                for (var k = 0; k < ownerKeys.length; k++) {
                    var oid = ownerKeys[k];
                    if (!oid || oid === 'player') continue;
                    var arr = instByOwner[oid];
                    if (!Array.isArray(arr) || !arr.length) continue;
                    for (var ii = 0; ii < arr.length; ii++) {
                        var inst = arr[ii];
                        if (!inst) continue;
                        var st = inst.started_tick != null ? Number(inst.started_tick) : NaN;
                        if (isFinite(st) && st > bestTick) {
                            bestTick = st;
                            bestOwnerId = oid;
                        }
                    }
                }
                if (bestOwnerId) {
                    chosenEnemyId = bestOwnerId;
                    eArr = Array.isArray(instByOwner[chosenEnemyId]) ? instByOwner[chosenEnemyId] : [];
                }
            }

            // 若自身与敌方都没有可显示的 Buff，则隐藏整个 HUD。
            var selfHas = Array.isArray(pArr) && pArr.some(function (inst) {
                return inst && inst.buff_id && (parseInt(inst.stacks, 10) || 0) > 0;
            });
            var enemyHas = Array.isArray(eArr) && eArr.some(function (inst) {
                return inst && inst.buff_id && (parseInt(inst.stacks, 10) || 0) > 0;
            });
            if (!selfHas && !enemyHas) {
                hud.style.display = 'none';
                return;
            }
            hud.style.display = '';

            if (enemyTitle) {
                enemyTitle.textContent = chosenEnemyId
                    ? ui('buff.hud.target_with_name', { name: getEnemyDisplayName(chosenEnemyId) })
                    : ui('buff.hud.target_none');
            }

            if (!chosenEnemyId) {
                enemyEl.textContent = ui('status.enemy_buffs.none_target');
                return;
            }

            // HUD 调试：帮助定位“敌方 buff 不显示”究竟是 ownerId 对不上还是 buff 实例不存在
            try {
                var sig = 't=' + String(targetEnemyId || '') + '|c=' + String(chosenEnemyId || '') + '|e=' + String(eArr && eArr.length ? eArr.length : 0);
                if (window.__buffHudLastSig !== sig) {
                    window.__buffHudLastSig = sig;
                    console.log('[BUFF-HUD]', {
                        targetEnemyId: targetEnemyId,
                        chosenEnemyId: chosenEnemyId,
                        enemyBuffInstanceCount: eArr && eArr.length ? eArr.length : 0,
                        playerBuffInstanceCount: pArr && pArr.length ? pArr.length : 0,
                        ownerKeys: Object.keys(instByOwner || {})
                    });
                }
            } catch (e0) { /* ignore */ }

            appendBuffChips(enemyEl, eArr, nowTick);
        }
        function shouldShowBlock(blockId) {
            var ctx = window.SceneCtx;
            if (ctx && typeof ctx.shouldShowLeftHudBlock === 'function') {
                return !!ctx.shouldShowLeftHudBlock(blockId);
            }
            return true;
        }
        function setBlockDisplay(id, visible) {
            var el = document.getElementById(id);
            if (!el) return;
            el.style.display = visible ? '' : 'none';
        }
        function shouldShowSurvivalMetric(metricId, survivalState) {
            var ctx = window.SceneCtx;
            if (ctx && typeof ctx.shouldShowSurvivalMetric === 'function') {
                return !!ctx.shouldShowSurvivalMetric(metricId, survivalState || null);
            }
            return true;
        }
        function setSurvivalMetricDisplay(id, visible) {
            var el = document.getElementById(id);
            if (!el) return;
            el.style.display = visible ? '' : 'none';
        }
        setBlockDisplay('status-role-card', shouldShowBlock('role'));
        setBlockDisplay('status-limbs', shouldShowBlock('limbs'));
        setBlockDisplay('status-survival', shouldShowBlock('survival'));
        setBlockDisplay('status-resources', shouldShowBlock('resources'));
        setBlockDisplay('quick-belt-dock', shouldShowBlock('quick_belt'));
        setBlockDisplay('status-attrs-block', shouldShowBlock('attrs'));

        updateLimbBlock();
        renderBuffHud();
        updateRoleNameFromCharacter();
        var CA = window.CharacterAttributes;
        if (CA && typeof CA.getEffectiveAttr === 'function') {
            var attrIds = ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'];
            attrIds.forEach(function (id) {
                var el = document.getElementById('status-attr-' + id);
                if (!el) return;
                var baseInn = CA.getBaseInnateAttr ? CA.getBaseInnateAttr(id) : (CA.getInnateAttr ? CA.getInnateAttr(id) : 0);
                var eff = CA.getEffectiveAttr(id);
                var extra = Math.max(0, eff - baseInn);
                if (extra > 0) el.textContent = baseInn + '+' + extra + '=' + eff;
                else el.textContent = String(eff);
            });
            var attrExpState = (typeof CA.getAttributeExpState === 'function')
                ? CA.getAttributeExpState('player')
                : {};
            attrIds.forEach(function (id) {
                var expEl = document.getElementById('status-attr-exp-exp-' + id);
                if (!expEl) return;
                var e = attrExpState && attrExpState[id] ? attrExpState[id] : { attribute_level: 0, exp: 0 };
                var exp = Math.max(0, Math.floor(Number(e.exp) || 0));
                expEl.textContent = String(exp);
            });
        }
        var Surv = window.Survival;
        var satietyText = document.getElementById('status-satiety-text');
        var satietyBar = document.getElementById('status-satiety-bar');
        var thirstText = document.getElementById('status-thirst-text');
        var thirstBar = document.getElementById('status-thirst-bar');
        var staminaText = document.getElementById('status-stamina-text');
        var staminaBar = document.getElementById('status-stamina-bar');
        var fatigueText = document.getElementById('status-fatigue-text');
        var fatigueBar = document.getElementById('status-fatigue-bar');
        var energyText = document.getElementById('status-energy-text');
        var energyBar = document.getElementById('status-energy-bar');
        var moodEl = document.getElementById('status-mood');
        var moodBar = document.getElementById('status-mood-bar');
        var nutritionEl = document.getElementById('status-nutrition');
        var nutritionBar = document.getElementById('status-nutrition-bar');
        var dirtynessEl = document.getElementById('status-dirtyness');
        var dirtynessBar = document.getElementById('status-dirtyness-bar');
        var weightEl = document.getElementById('status-weight');
        if (!satietyText || !weightEl) {
            refreshPlayerActionsMenuUi();
            return;
        }

        if (Surv && typeof Surv.getState === 'function') {
            var s = Surv.getState();
            setSurvivalMetricDisplay('status-metric-satiety', shouldShowSurvivalMetric('satiety', s));
            setSurvivalMetricDisplay('status-metric-thirst', shouldShowSurvivalMetric('thirst', s));
            setSurvivalMetricDisplay('status-metric-mood', shouldShowSurvivalMetric('mood', s));
            setSurvivalMetricDisplay('status-metric-nutrition', shouldShowSurvivalMetric('nutrition', s));
            setSurvivalMetricDisplay('status-metric-dirtyness', shouldShowSurvivalMetric('dirtyness', s));
            setSurvivalMetricDisplay('status-metric-energy', shouldShowSurvivalMetric('energy', s));
            setSurvivalMetricDisplay('status-metric-stamina', shouldShowSurvivalMetric('stamina', s));
            setSurvivalMetricDisplay('status-metric-fatigue', shouldShowSurvivalMetric('fatigue', s));
            setSurvivalMetricDisplay('status-metric-weight', shouldShowSurvivalMetric('weight', s));

            var zone = Surv.getSatietyZone ? Surv.getSatietyZone() : 'normal';
            satietyText.textContent = getSatietyLabel(zone);
            satietyText.className = zone === 'normal' ? 'value ok' : (zone === 'starvation' || zone === 'severe' ? 'value danger' : 'value warn');
            var satMax = 120;
            var satPct = Math.min(100, (s.satiety / satMax) * 100);
            satietyBar.style.width = satPct + '%';

            thirstText.textContent = getThirstLabel(s.thirst);
            thirstText.className = s.thirst >= 60 ? 'value ok' : (s.thirst <= 0 ? 'value danger' : 'value warn');
            thirstBar.style.width = s.thirst + '%';

            var stamMax = s.stamina_max || 100;
            staminaText.textContent = s.stamina.toFixed(1) + ' / ' + stamMax;
            staminaText.className = s.stamina <= 0 ? 'value danger' : (s.stamina < stamMax * 0.3 ? 'value warn' : 'value ok');
            staminaBar.style.width = stamMax > 0 ? (s.stamina / stamMax * 100) + '%' : '0%';

            if (fatigueText) {
                var fatigueValue = Math.max(0, Math.min(100, Number(s.fatigue) || 0));
                var fatigueState = 'normal';
                if (fatigueValue >= 80) fatigueState = 'sleepy';
                else if (fatigueValue > 50 && fatigueValue < 80) fatigueState = 'tired';
                var fatigueStateKey = fatigueState === 'sleepy'
                    ? 'survival.fatigue.sleepy'
                    : (fatigueState === 'tired' ? 'survival.fatigue.tired' : 'survival.fatigue.normal');
                fatigueText.textContent = ui(fatigueStateKey) + ' (' + fatigueValue.toFixed(1) + '/100.0)';
                fatigueText.className = fatigueState === 'sleepy' ? 'value danger' : (fatigueState === 'tired' ? 'value warn' : 'value ok');
                if (fatigueBar) fatigueBar.style.width = fatigueValue + '%';
            }

            var enMax = s.energy_max || 100;
            energyText.textContent = s.energy.toFixed(1) + ' / ' + enMax;
            energyText.className = s.energy <= 0 ? 'value danger' : (s.energy < enMax * 0.3 ? 'value warn' : 'value ok');
            energyBar.style.width = enMax > 0 ? (s.energy / enMax * 100) + '%' : '0%';

            if (moodEl) {
                var moodValue = Math.round(Number(s.mood) || 0);
                var moodRange = (Surv.getMoodRangeByValue && typeof Surv.getMoodRangeByValue === 'function')
                    ? Surv.getMoodRangeByValue(moodValue)
                    : 'normal';
                var moodKey = moodRange === 'low' ? 'survival.mood.low'
                    : (moodRange === 'high' ? 'survival.mood.high' : 'survival.mood.normal');
                moodEl.textContent = ui(moodKey) + ' (' + moodValue + '/1000)';
                moodEl.className = moodRange === 'low' ? 'value danger' : (moodRange === 'high' ? 'value ok' : 'value warn');
                if (moodBar) {
                    var moodPct = Math.max(0, Math.min(100, (moodValue / 1000) * 100));
                    moodBar.style.width = moodPct + '%';
                }
            }
            if (nutritionEl) {
                var nutritionValue = Math.max(0, Math.min(100, Number(s.nutrition) || 0));
                nutritionEl.textContent = Math.round(nutritionValue) + ' / 100';
                nutritionEl.className = nutritionValue <= 10 ? 'value danger' : (nutritionValue < 40 ? 'value warn' : 'value ok');
                if (nutritionBar) nutritionBar.style.width = nutritionValue + '%';
            }
            if (dirtynessEl) {
                var dirtynessValue = Math.max(0, Math.min(100, Number(s.dirtyness) || 0));
                dirtynessEl.textContent = Math.round(dirtynessValue) + ' / 100';
                dirtynessEl.className = dirtynessValue >= 80 ? 'value danger' : (dirtynessValue >= 50 ? 'value warn' : 'value ok');
                if (dirtynessBar) dirtynessBar.style.width = dirtynessValue + '%';
            }

            var battleCard = document.getElementById('status-combat-resources-card');
            var battleWrap = document.getElementById('status-battle-resources');
            var showBattleCardByRule = shouldShowBlock('combat_resources');
            if (battleCard) battleCard.style.display = showBattleCardByRule ? '' : 'none';
            if (battleWrap) {
                if (showBattleCardByRule) {
                    var qm = s.qi_li_max != null ? s.qi_li_max : (Surv.getQiLiMax ? Surv.getQiLiMax() : 100);
                    var qc = s.qi_li_current != null ? s.qi_li_current : 0;
                    var dmax = s.diqi_max != null ? s.diqi_max : 0;
                    var dc = s.diqi_current != null ? s.diqi_current : 0;
                    var dsh = s.diqi_shield_remaining != null ? s.diqi_shield_remaining : 0;
                    var qiText = document.getElementById('status-qi-li-text');
                    var qiBar = document.getElementById('status-qi-li-bar');
                    var dqText = document.getElementById('status-diqi-text');
                    var dqBar = document.getElementById('status-diqi-bar');
                    var shText = document.getElementById('status-diqi-shield-text');
                    if (qiText) qiText.textContent = qc.toFixed(0) + ' / ' + qm;
                    if (qiBar) qiBar.style.width = qm > 0 ? (Math.min(100, (qc / qm) * 100)) + '%' : '0%';
                    if (dqText) dqText.textContent = dmax > 0 ? (dc.toFixed(1) + ' / ' + dmax) : '—';
                    if (dqBar) dqBar.style.width = dmax > 0 ? (Math.min(100, (dc / dmax) * 100)) + '%' : '0%';
                    if (shText) shText.textContent = dsh > 0 ? String(Math.floor(dsh)) : '—';
                }
            }

            weightEl.textContent = s.weight_kg + ' kg';
            var carryEl = document.getElementById('status-carry');
            var potentialEl = document.getElementById('status-potential');
            var combatExpEl = document.getElementById('status-combat-experience');
            if (carryEl) {
                var cap = (window.CharacterAttributes && typeof window.CharacterAttributes.getCarryCapacity === 'function')
                    ? window.CharacterAttributes.getCarryCapacity() : null;
                var current = (IE && typeof IE.getCurrentCarryWeight === 'function') ? IE.getCurrentCarryWeight() : null;
                if (cap != null && current != null)
                    carryEl.textContent = current.toFixed(1) + ' / ' + cap.toFixed(1) + ' kg';
                else if (cap != null)
                    carryEl.textContent = '— / ' + cap.toFixed(1) + ' kg';
                else
                    carryEl.textContent = '—';
            }
            if (potentialEl) {
                var pVal = (IE && typeof IE.getPotential === 'function') ? IE.getPotential() : null;
                potentialEl.textContent = (pVal == null) ? '—' : String(pVal);
            }
            if (combatExpEl) {
                var cVal = (IE && typeof IE.getCombatExperience === 'function') ? IE.getCombatExperience() : null;
                combatExpEl.textContent = (cVal == null) ? '—' : String(cVal);
            }
        } else {
            satietyText.textContent = '—';
            satietyBar.style.width = '100%';
            thirstText.textContent = '—';
            thirstBar.style.width = '100%';
            setSurvivalMetricDisplay('status-metric-satiety', shouldShowSurvivalMetric('satiety', null));
            setSurvivalMetricDisplay('status-metric-thirst', shouldShowSurvivalMetric('thirst', null));
            setSurvivalMetricDisplay('status-metric-mood', shouldShowSurvivalMetric('mood', null));
            setSurvivalMetricDisplay('status-metric-nutrition', shouldShowSurvivalMetric('nutrition', null));
            setSurvivalMetricDisplay('status-metric-dirtyness', shouldShowSurvivalMetric('dirtyness', null));
            setSurvivalMetricDisplay('status-metric-energy', shouldShowSurvivalMetric('energy', null));
            setSurvivalMetricDisplay('status-metric-stamina', shouldShowSurvivalMetric('stamina', null));
            setSurvivalMetricDisplay('status-metric-fatigue', shouldShowSurvivalMetric('fatigue', null));
            setSurvivalMetricDisplay('status-metric-weight', shouldShowSurvivalMetric('weight', null));
            if (gatherState) {
                staminaText.textContent = gatherState.stamina + ' / ' + gatherState.stamina_max;
                staminaBar.style.width = (gatherState.stamina_max > 0 ? (gatherState.stamina / gatherState.stamina_max * 100) : 0) + '%';
            } else {
                staminaText.textContent = '—';
                staminaBar.style.width = '100%';
            }
            energyText.textContent = '—';
            energyBar.style.width = '100%';
            if (fatigueText) {
                fatigueText.textContent = '—';
                fatigueText.className = 'value';
            }
            if (fatigueBar) fatigueBar.style.width = '0%';
            if (moodEl) {
                moodEl.textContent = '—';
                moodEl.className = 'value';
            }
            if (moodBar) moodBar.style.width = '50%';
            if (nutritionEl) {
                nutritionEl.textContent = '—';
                nutritionEl.className = 'value';
            }
            if (nutritionBar) nutritionBar.style.width = '100%';
            if (dirtynessEl) {
                dirtynessEl.textContent = '—';
                dirtynessEl.className = 'value';
            }
            if (dirtynessBar) dirtynessBar.style.width = '0%';
            weightEl.textContent = '—';
            var carryEl = document.getElementById('status-carry');
            var potentialEl = document.getElementById('status-potential');
            var combatExpEl = document.getElementById('status-combat-experience');
            if (carryEl) {
                var cap = (window.CharacterAttributes && typeof window.CharacterAttributes.getCarryCapacity === 'function') ? window.CharacterAttributes.getCarryCapacity() : null;
                var current = (IE && typeof IE.getCurrentCarryWeight === 'function') ? IE.getCurrentCarryWeight() : null;
                if (cap != null && current != null) carryEl.textContent = current.toFixed(1) + ' / ' + cap.toFixed(1) + ' kg';
                else if (cap != null) carryEl.textContent = '— / ' + cap.toFixed(1) + ' kg';
                else carryEl.textContent = '—';
            }
            if (potentialEl) potentialEl.textContent = '—';
            if (combatExpEl) combatExpEl.textContent = '—';
        }
        refreshPlayerActionsMenuUi();
    }
    window.SceneCtx.updateStatusPanel = updateStatusPanel;

    function setIdleActionType(t) {
        if (window.SceneCtx) window.SceneCtx.idleActionType = t || '';
    }

    function stopGatheringIdle() {
        if (gatheringIdleTimer) {
            clearInterval(gatheringIdleTimer);
            gatheringIdleTimer = null;
            gatheringIdleAt = null;
        }
        if (tiaoXiIdleTimer) {
            clearInterval(tiaoXiIdleTimer);
            tiaoXiIdleTimer = null;
        }
        setIdleActionType('');
    }
    window.SceneCtx.isGatheringIdling = function () { return !!gatheringIdleTimer; };
    window.SceneCtx.isTiaoXiIdling = function () { return !!tiaoXiIdleTimer; };

    function stopTiaoXiIdle(withMsg) {
        if (!tiaoXiIdleTimer) return;
        clearInterval(tiaoXiIdleTimer);
        tiaoXiIdleTimer = null;
        tiaoXiCapModeNotified = false;
        setIdleActionType('');
        if (withMsg !== false) showMsg('已停止挂机调息', 'info');
    }

    function stopRestIdleTimer() {
        if (!restIdleTimer) return;
        clearInterval(restIdleTimer);
        restIdleTimer = null;
    }

    function startRestIdleTimer() {
        if (restIdleTimer) return;
        restIdleTimer = setInterval(function () {
            var Surv = window.Survival;
            if (!Surv || typeof Surv.getState !== 'function' || typeof Surv.advanceTick !== 'function') {
                stopRestIdleTimer();
                return;
            }
            var st = Surv.getState() || {};
            if (!st.isResting) {
                stopRestIdleTimer();
                return;
            }
            Surv.advanceTick();
            if (window.SceneRenderer) window.SceneRenderer.render();
            updateStatusPanel();
        }, getRestAutoTickMs());
    }

    function setRestingActionActive(active, opts) {
        var options = opts || {};
        var Surv = window.Survival;
        if (!Surv || typeof Surv.setResting !== 'function' || typeof Surv.getState !== 'function') return false;
        var before = !!((Surv.getState() || {}).isResting);
        var next = !!active;
        Surv.setResting(next);
        if (next) startRestIdleTimer();
        else stopRestIdleTimer();
        if (before !== next && options.showMsg !== false) {
            showMsg(ui(next ? 'player.action.rest.enabled' : 'player.action.rest.disabled'), 'info');
        }
        return before !== next;
    }

    function onTiaoXiIdleTick() {
        var CHA = window.CombatHubActions;
        if (!CHA || typeof CHA.tryExecuteHubAction !== 'function') {
            stopTiaoXiIdle(false);
            return;
        }
        var r = CHA.tryExecuteHubAction('combat_basic_breath', 'tiao_xi_once', { isBattleContext: hubAdjacentForBreathActions });
        if (!r.ok) {
            stopTiaoXiIdle(false);
            showMsg(ui(r.reason_key || 'combat.hub.fail.tiao_xi.diqi_max'), 'warn');
            if (window.SceneRenderer) window.SceneRenderer.render();
            updateStatusPanel();
            return;
        }
        var Surv = window.Survival;
        var s = Surv && typeof Surv.getState === 'function' ? Surv.getState() : null;
        if (s && s.diqi_max > 0 && s.diqi_cap_limit > 0 && s.diqi_max >= s.diqi_cap_limit && !tiaoXiCapModeNotified) {
            tiaoXiCapModeNotified = true;
            showMsg(ui('combat.hub.info.tiao_xi.cap_mode'), 'info');
        }
        // 封顶后达到 2*diqi_max-1 自动停（与 06 设计一致）
        var atCapNow = !!(s && s.diqi_max > 0 && s.diqi_cap_limit > 0 && s.diqi_max >= s.diqi_cap_limit);
        if (s && atCapNow && s.diqi_current >= (2 * s.diqi_max - 1)) {
            stopTiaoXiIdle(false);
            showMsg(ui('combat.hub.info.tiao_xi.overflow_stop'), 'info');
        }
        if (window.SceneRenderer) window.SceneRenderer.render();
        updateStatusPanel();
    }

    function startTiaoXiIdle() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (tiaoXiIdleTimer) return;
        if (gatheringIdleTimer) {
            showMsg('请先停止采集挂机', 'info');
            return;
        }
        var CHA = window.CombatHubActions;
        if (!CHA || typeof CHA.tryExecuteHubAction !== 'function') {
            showMsg(ui('combat.hub.fail.modules'), 'warn');
            return;
        }
        var r0 = CHA.tryExecuteHubAction('combat_basic_breath', 'tiao_xi_once', { isBattleContext: hubAdjacentForBreathActions });
        if (!r0.ok) {
            showMsg(ui(r0.reason_key || 'combat.hub.fail.tiao_xi.diqi_max'), 'warn');
            return;
        }
        var Surv = window.Survival;
        var s0 = Surv && typeof Surv.getState === 'function' ? Surv.getState() : null;
        if (s0 && s0.diqi_max > 0 && s0.diqi_cap_limit > 0 && s0.diqi_max >= s0.diqi_cap_limit) {
            tiaoXiCapModeNotified = true;
            showMsg(ui('combat.hub.info.tiao_xi.cap_mode'), 'info');
        } else {
            tiaoXiCapModeNotified = false;
        }
        var atCap0 = !!(s0 && s0.diqi_max > 0 && s0.diqi_cap_limit > 0 && s0.diqi_max >= s0.diqi_cap_limit);
        if (s0 && atCap0 && s0.diqi_current >= (2 * s0.diqi_max - 1)) {
            showMsg(ui('combat.hub.info.tiao_xi.overflow_stop'), 'info');
            if (window.SceneRenderer) window.SceneRenderer.render();
            updateStatusPanel();
            return;
        }
        tiaoXiIdleTimer = setInterval(onTiaoXiIdleTick, getIdleTickMs());
        setIdleActionType('tiao_xi');
        showMsg('开始挂机调息', 'info');
        if (window.SceneRenderer) window.SceneRenderer.render();
        updateStatusPanel();
    }

    function markCellDirty(mapId, x, y) {
        if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
            window.SceneCtx.pushDirtyCell(x, y);
        }
    }

    function getMapsRef() {
        if (!E || typeof E.getMaps !== 'function') return null;
        return E.getMaps();
    }

    function normalizeTempStationEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        var mapId = entry.map_id != null ? String(entry.map_id) : '';
        var x = Math.floor(Number(entry.x));
        var y = Math.floor(Number(entry.y));
        var placedTick = Math.max(0, Math.floor(Number(entry.placed_tick) || 0));
        var despawnTick = Math.max(0, Math.floor(Number(entry.despawn_tick) || 0));
        if (!mapId || !isFinite(x) || !isFinite(y) || despawnTick <= 0) return null;
        return {
            entity_id: COOKING_TEMP_STATION_ENTITY_ID,
            map_id: mapId,
            x: x,
            y: y,
            placed_tick: placedTick,
            despawn_tick: despawnTick,
            allowed_methods: Array.isArray(entry.allowed_methods)
                ? entry.allowed_methods.map(function (m0) { return String(m0).trim(); }).filter(function (m1) { return !!m1; })
                : [],
            installed_accessory_item_ids: Array.isArray(entry.installed_accessory_item_ids)
                ? entry.installed_accessory_item_ids.map(function (z) { return String(z).trim(); }).filter(function (z0) { return !!z0; })
                : []
        };
    }

    function getCookingTempStationsRuntime() {
        if (!window.SceneCtx) return [];
        if (!Array.isArray(window.SceneCtx.cooking_temp_stations_runtime)) {
            window.SceneCtx.cooking_temp_stations_runtime = [];
        }
        var arr = window.SceneCtx.cooking_temp_stations_runtime;
        var out = [];
        var i;
        for (i = 0; i < arr.length; i++) {
            var norm = normalizeTempStationEntry(arr[i]);
            if (norm) out.push(norm);
        }
        window.SceneCtx.cooking_temp_stations_runtime = out;
        return out;
    }

    function isCookingTempStationEntity(rec) {
        if (!rec || typeof rec !== 'object') return false;
        return String(rec.entity_id || '') === COOKING_TEMP_STATION_ENTITY_ID;
    }

    function findCookingTempStationAt(mapId, x, y) {
        var arr = getCookingTempStationsRuntime();
        var i;
        for (i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (e.map_id === mapId && e.x === x && e.y === y) return e;
        }
        return null;
    }

    function upsertCookingTempStation(entry) {
        var norm = normalizeTempStationEntry(entry);
        if (!norm) return null;
        var arr = getCookingTempStationsRuntime();
        var i;
        for (i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (e.map_id === norm.map_id && e.x === norm.x && e.y === norm.y) {
                arr[i] = norm;
                return norm;
            }
        }
        arr.push(norm);
        return norm;
    }

    function removeCookingTempStationAt(mapId, x, y) {
        var arr = getCookingTempStationsRuntime();
        var i;
        for (i = arr.length - 1; i >= 0; i--) {
            var e = arr[i];
            if (e.map_id === mapId && e.x === x && e.y === y) arr.splice(i, 1);
        }
    }

    function syncCookingTempStationsIntoMaps() {
        var maps = getMapsRef();
        if (!maps || typeof maps !== 'object') return;
        var mapIds = Object.keys(maps);
        var i;
        for (i = 0; i < mapIds.length; i++) {
            var map = maps[mapIds[i]];
            if (!map || !Array.isArray(map.entities)) continue;
            var kept = [];
            var j;
            for (j = 0; j < map.entities.length; j++) {
                var rec = map.entities[j];
                if (isCookingTempStationEntity(rec)) continue;
                kept.push(rec);
            }
            map.entities = kept;
        }
        var arr = getCookingTempStationsRuntime();
        for (i = 0; i < arr.length; i++) {
            var e = arr[i];
            var m = maps[e.map_id];
            if (!m) continue;
            if (!Array.isArray(m.entities)) m.entities = [];
            m.entities.push({
                x: e.x,
                y: e.y,
                entity_id: COOKING_TEMP_STATION_ENTITY_ID,
                placed_tick: e.placed_tick,
                despawn_tick: e.despawn_tick,
                allowed_methods: Array.isArray(e.allowed_methods) ? e.allowed_methods.slice() : [],
                installed_accessory_item_ids: Array.isArray(e.installed_accessory_item_ids) ? e.installed_accessory_item_ids.slice() : []
            });
        }
    }

    function placeTempCookingStation(mapId, x, y, options) {
        var gt = window.GameTime && typeof window.GameTime.getState === 'function' ? window.GameTime.getState() : null;
        var placedTick = gt && typeof gt.totalTicks === 'number' ? Math.max(0, Math.floor(gt.totalTicks)) : 0;
        var opts = options && typeof options === 'object' ? options : {};
        var life = Math.max(1, Math.floor(Number(opts.lifetime_ticks) || cookingTempStationLifetimeTicks || 50));
        var next = upsertCookingTempStation({
            map_id: String(mapId || ''),
            x: Math.floor(Number(x)),
            y: Math.floor(Number(y)),
            placed_tick: placedTick,
            despawn_tick: placedTick + life,
            allowed_methods: Array.isArray(opts.allowed_methods) ? opts.allowed_methods.slice() : [],
            installed_accessory_item_ids: Array.isArray(opts.installed_accessory_item_ids) ? opts.installed_accessory_item_ids.slice() : []
        });
        if (!next) return null;
        syncCookingTempStationsIntoMaps();
        markCellDirty(next.map_id, next.x, next.y);
        if (window.SceneRenderer) window.SceneRenderer.render();
        return Object.assign({}, next);
    }

    function forEachAdjacentCell(x, y, fn) {
        var dy;
        for (dy = -1; dy <= 1; dy++) {
            var dx;
            for (dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                var rx = (x | 0) + dx;
                var ry = (y | 0) + dy;
                if (fn(rx, ry) === true) return true;
            }
        }
        return false;
    }

    function isCookingStationAnnotationText(s) {
        if (!s) return false;
        var t = String(s).trim();
        if (t === '制药台' || t === '药炉') return false;
        return t === '烹饪台' || t === '灶台' || t === '烹饪灶' || t.indexOf('烹饪') >= 0 || t.indexOf('灶') >= 0;
    }

    function isPharmacyStationAnnotationText(s) {
        if (!s) return false;
        var t = String(s).trim();
        return t === '制药台' || t === '药炉';
    }

    // 口径：烹饪设施仅允许邻接交互，不允许站在同格交互。
    function getCurrentCookingStationContext() {
        if (!E || typeof E.getState !== 'function') return null;
        var st = E.getState();
        var hit = null;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(x, y) : null;
            if (isCookingTempStationEntity(rec)) {
                var temp = findCookingTempStationAt(st.mapId, x, y) || normalizeTempStationEntry(Object.assign({ map_id: st.mapId }, rec));
                hit = {
                    station_type: 'temp',
                    map_id: st.mapId,
                    x: x,
                    y: y,
                    temp_station: temp
                };
                return true;
            }
            var ann = (E.getAnnotationAt && typeof E.getAnnotationAt === 'function') ? E.getAnnotationAt(x, y) : null;
            var s = ann != null ? String(ann) : '';
            if (isCookingStationAnnotationText(s)) {
                hit = {
                    station_type: 'main',
                    map_id: st.mapId,
                    x: x,
                    y: y
                };
                return true;
            }
            return false;
        });
        if (hit) return hit;
        return null;
    }

    // === Auto-generated Pharmacy Helper ===
    function getCurrentPharmacyStationContext() {
        if (!E || typeof E.getState !== 'function') return null;
        var st = E.getState();
        var hit = null;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(x, y) : null;
            if (isPharmacyTempStationEntity(rec)) {
                var temp = findPharmacyTempStationAt(st.mapId, x, y) || normalizeTempStationEntry(Object.assign({ map_id: st.mapId }, rec));
                hit = {
                    station_type: 'temp',
                    map_id: st.mapId,
                    x: x,
                    y: y,
                    temp_station: temp
                };
                return true;
            }
            var ann = (E.getAnnotationAt && typeof E.getAnnotationAt === 'function') ? E.getAnnotationAt(x, y) : null;
            var s = ann != null ? String(ann) : '';
            if (isPharmacyStationAnnotationText(s)) {
                hit = {
                    station_type: 'main',
                    map_id: st.mapId,
                    x: x,
                    y: y
                };
                return true;
            }
            return false;
        });
        if (hit) return hit;
        return null;
    }

    function isCompostStationAnnotationText(s) {
        var t = String(s || '').trim();
        return t === '制肥桶';
    }

    function isBedStationAnnotationText(s) {
        var t = String(s || '').trim();
        return t === '床' || t === '床铺';
    }

    function getCurrentCompostStationContext() {
        if (!E || typeof E.getState !== 'function') return null;
        var st = E.getState();
        var hit = null;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            var ann = (E.getAnnotationAt && typeof E.getAnnotationAt === 'function') ? E.getAnnotationAt(x, y) : null;
            var s = ann != null ? String(ann) : '';
            if (isCompostStationAnnotationText(s)) {
                hit = {
                    station_type: 'main',
                    map_id: st.mapId,
                    x: x,
                    y: y
                };
                return true;
            }
            return false;
        });
        if (hit) return hit;
        return null;
    }

    function getCurrentBedStationContext() {
        if (!E || typeof E.getState !== 'function') return null;
        var st = E.getState();
        var hit = null;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            var ann = (E.getAnnotationAt && typeof E.getAnnotationAt === 'function') ? E.getAnnotationAt(x, y) : null;
            var s = ann != null ? String(ann) : '';
            if (isBedStationAnnotationText(s)) {
                hit = {
                    station_type: 'main',
                    map_id: st.mapId,
                    x: x,
                    y: y
                };
                return true;
            }
            return false;
        });
        if (hit) return hit;
        return null;
    }

    /** 当前地图格是否配置了「灶格 → 设施 NPC」绑定（见 map.cooking_station_interact_npc_*） */
    function isCookingStationCellRepairGated(mapId, x, y) {
        if (!E || typeof E.getMap !== 'function' || typeof E.getCookingStationInteractNpcId !== 'function') return false;
        var map = E.getMap();
        if (!map || String(map.map_id || '') !== String(mapId || '')) return false;
        return !!E.getCookingStationInteractNpcId(x | 0, y | 0);
    }

    /** 与烹饪对称：仅当地图为制药格绑定了设施 NPC 时，才走 `PHARMACY_BASE_STATION_UNLOCK_FLAG` 维修门控 */
    function isPharmacyStationCellRepairGated(mapId, x, y) {
        if (!E || typeof E.getMap !== 'function' || typeof E.getPharmacyStationInteractNpcId !== 'function') return false;
        var map = E.getMap();
        if (!map || String(map.map_id || '') !== String(mapId || '')) return false;
        return !!E.getPharmacyStationInteractNpcId(x | 0, y | 0);
    }

    /**
     * 主灶台且地图绑定了设施 NPC 时：未解锁 `COOKING_BASE_STATION_UNLOCK_FLAG` 则禁止打开烹饪 UI、倒水添柴、tryCookAtStation。
     * 临时灶 / 无绑定格不受此限制。
     */
    function isCookingUiBlockedByRepairForContext(stationCtx) {
        if (!stationCtx || stationCtx.station_type === 'temp') return false;
        if (!isCookingStationCellRepairGated(stationCtx.map_id, stationCtx.x, stationCtx.y)) return false;
        if (!window.NPCSystem || typeof window.NPCSystem.isDemoFlagTrue !== 'function') return true;
        return !window.NPCSystem.isDemoFlagTrue(COOKING_BASE_STATION_UNLOCK_FLAG);
    }

    // === Auto-generated Pharmacy Helper ===
    function isPharmacyUiBlockedByRepairForContext(stationCtx) {
        if (!stationCtx || stationCtx.station_type === 'temp') return false;
        if (!isPharmacyStationCellRepairGated(stationCtx.map_id, stationCtx.x, stationCtx.y)) return false;
        if (!window.NPCSystem || typeof window.NPCSystem.isDemoFlagTrue !== 'function') return true;
        return !window.NPCSystem.isDemoFlagTrue(PHARMACY_BASE_STATION_UNLOCK_FLAG);
    }

    function isCookingUiBlockedByRepair() {
        return isCookingUiBlockedByRepairForContext(getCurrentCookingStationContext());
    }

    function isPharmacyUiBlockedByRepair() {
        return isPharmacyUiBlockedByRepairForContext(getCurrentPharmacyStationContext());
    }

    function isAdjacentToWarehouseTile() {
        if (!E || typeof E.getState !== 'function' || typeof E.getAnnotationAt !== 'function') return false;
        var st = E.getState();
        var ok = false;
        forEachAdjacentCell(st.x, st.y, function (x, y) {
            if (E.getAnnotationAt(x, y) === '仓库') {
                ok = true;
                return true;
            }
            return false;
        });
        return ok;
    }

    function hasAdjacentEnemyNow() {
        if (!E || typeof E.getState !== 'function' || typeof E.getEnemyAt !== 'function') return false;
        var st = E.getState();
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                var eid = E.getEnemyAt(st.x + dx, st.y + dy);
                if (eid) return true;
            }
        }
        return false;
    }
    window.SceneCtx.hasAdjacentEnemyForCombat = hasAdjacentEnemyNow;

    function refreshRenderProfile(burstMs) {
        if (!window.SceneCtx) return;
        var contextualCombat = !!combatPanelOpen || hasAdjacentEnemyNow();
        if (contextualCombat) {
            window.SceneCtx.renderProfile = 'combat';
            if (combatRenderProfileTimer) {
                clearTimeout(combatRenderProfileTimer);
                combatRenderProfileTimer = null;
            }
            return;
        }
        if (burstMs != null && burstMs > 0) {
            window.SceneCtx.renderProfile = 'combat';
            if (combatRenderProfileTimer) clearTimeout(combatRenderProfileTimer);
            combatRenderProfileTimer = setTimeout(function () {
                combatRenderProfileTimer = null;
                refreshRenderProfile();
            }, Math.max(120, burstMs || 600));
            return;
        }
        if (!combatRenderProfileTimer) {
            window.SceneCtx.renderProfile = 'normal';
        }
    }

    function bumpCombatRenderProfile(ms) {
        refreshRenderProfile(ms || 600);
    }

    function isPlayerComaActive() {
        return !!(window.BuffSystem
            && typeof window.BuffSystem.hasBuffByBuffId === 'function'
            && window.BuffSystem.hasBuffByBuffId('player', 'survival_coma'));
    }

    function guardPlayerComaBlocked() {
        if (!isPlayerComaActive()) return false;
        showMsg(ui('intro.blocked.action'), 'info');
        return true;
    }

    var BED_FATIGUE_BUFF_IDS = ['survival_fatigue', 'survival_fatigue_sleepy'];

    function hasBedSleepDebuff() {
        var Buff = window.BuffSystem;
        if (!Buff || typeof Buff.hasBuffByBuffId !== 'function') return false;
        for (var i = 0; i < BED_FATIGUE_BUFF_IDS.length; i++) {
            if (Buff.hasBuffByBuffId('player', BED_FATIGUE_BUFF_IDS[i])) return true;
        }
        return false;
    }

    function settleSleepAttributeExpOnce() {
        var CA = window.CharacterAttributes;
        if (!CA || typeof CA.settleAttributeExpOnce !== 'function') return { ok: false, any_success: false };
        return CA.settleAttributeExpOnce('player', { reason: 'bed_sleep', source: 'facility_bed' }) || { ok: false, any_success: false };
    }

    function executeBedSleepAction() {
        if (!isOnBedStationTile()) {
            showMsg(ui('bed.sleep.not_on_tile'), 'info');
            return false;
        }
        if (!hasBedSleepDebuff()) {
            showMsg(ui('bed.sleep.require_fatigue_debuff'), 'info');
            return false;
        }
        var ask = ui('bed.sleep.confirm');
        if (typeof window.confirm === 'function' && !window.confirm(ask)) return false;
        var i;
        for (i = 0; i < 48; i++) {
            if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
            if (i === 47) {
                if (window.Survival && typeof window.Survival.clearFatigue === 'function') window.Survival.clearFatigue();
                var settleRet = settleSleepAttributeExpOnce();
                if (settleRet && settleRet.ok && settleRet.any_success) {
                    showMsg(ui('bed.sleep.attr_exp_upgraded'), 'success');
                }
            }
        }
        showMsg(ui('bed.sleep.done'), 'success');
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (window.SceneRenderer) window.SceneRenderer.render();
        return true;
    }

    function trySleepAtBed() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return false;
        }
        if (guardPlayerComaBlocked()) return false;
        return executeBedSleepAction();
    }

    var ACTION_TYPES = {
        MOVE: 'move',
        GATHER: 'gather',
        CRAFT: 'craft',
        NPC_INTERACT: 'npc_interact',
        ITEM_USE: 'item_use'
    };

    function normalizeActionType(actionType) {
        var key = String(actionType || '').trim().toLowerCase();
        if (!key) return '';
        if (key === 'movement') return ACTION_TYPES.MOVE;
        return key;
    }

    function isPlayerActionDisabledByBuff(actionType) {
        var key = normalizeActionType(actionType);
        if (!key) return false;
        var Buff = window.BuffSystem;
        if (!Buff) return false;
        if (key === ACTION_TYPES.MOVE && typeof Buff.hasMovementDisabled === 'function' && Buff.hasMovementDisabled('player')) {
            return true;
        }
        if (typeof Buff.hasActionDisabled === 'function') {
            return !!Buff.hasActionDisabled('player', key);
        }
        return false;
    }

    function guardPlayerActionBlocked(actionType, opts) {
        if (!isPlayerActionDisabledByBuff(actionType)) return false;
        var options = opts || {};
        var msg = options.msg || ui('intro.blocked.action');
        var kind = options.level || 'info';
        showMsg(msg, kind);
        return true;
    }

    function onGatherTick() {
        if (guardPlayerActionBlocked(ACTION_TYPES.GATHER)) {
            stopGatheringIdle();
            return;
        }
        var st = E.getState();
        var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(st.x, st.y) : null;
        var entityId = rec ? (rec.entity_id || null) : E.getEntityAt(st.x, st.y);
        var gatheringInst = rec && rec.gathering_instance_id ? String(rec.gathering_instance_id) : null;
        if (!entityId || !G.canGather(entityId, gatheringInst)) {
            stopGatheringIdle();
            if (!G.canGather(entityId, gatheringInst) && entityId) showMsg(ui('log.warn.gather.stop.full_or_tired'));
            markCellDirty(st.mapId, st.x, st.y);
            render();
            return;
        }
        var result = G.doGather(entityId, gatheringInst);
        if (result.success && result.gathered) showMsg(result.message, 'success');
        else if (!result.success) showMsg(result.message, 'warn');
        markCellDirty(st.mapId, st.x, st.y);
        render();
    }

    function onGatherClick() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (guardPlayerComaBlocked()) return;
        if (guardPlayerActionBlocked(ACTION_TYPES.GATHER)) return;
        var st = E.getState();
        var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(st.x, st.y) : null;
        var entityId = rec ? (rec.entity_id || null) : E.getEntityAt(st.x, st.y);
        var gatheringInst = rec && rec.gathering_instance_id ? String(rec.gathering_instance_id) : null;
        if (!entityId || !G.canGather(entityId, gatheringInst)) return;
        if (tiaoXiIdleTimer) {
            showMsg('请先停止挂机调息', 'info');
            return;
        }
        if (gatheringIdleTimer) return;
        gatheringIdleAt = { mapId: st.mapId, x: st.x, y: st.y };
        onGatherTick();
        gatheringIdleTimer = setInterval(onGatherTick, getIdleTickMs());
        setIdleActionType('gathering');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function onGatherStopClick() {
        stopGatheringIdle();
        showMsg(ui('log.info.gather.stop'), 'info');
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function findFirstContainerSlotByItemId(itemId) {
        if (!IE || !itemId) return null;
        var targets = [
            { type: 'pocket', arr: IE.getPocketArray ? IE.getPocketArray() : [] },
            { type: 'vest', arr: IE.getVestArray ? IE.getVestArray() : [] },
            { type: 'backpack', arr: IE.getBackpackArray ? IE.getBackpackArray() : [] }
        ];
        var t, i;
        for (t = 0; t < targets.length; t++) {
            var arr = targets[t].arr;
            if (!Array.isArray(arr)) continue;
            for (i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                if (String(cell.item_id) === String(itemId)) {
                    return { containerType: targets[t].type, index: i };
                }
            }
        }
        return null;
    }

    function getInventoryContainerArray(containerType) {
        if (!IE) return null;
        var t = containerType != null ? String(containerType) : '';
        if (t === 'pocket') return IE.getPocketArray ? IE.getPocketArray() : null;
        if (t === 'vest') return IE.getVestArray ? IE.getVestArray() : null;
        if (t === 'backpack') return IE.getBackpackArray ? IE.getBackpackArray() : null;
        return null;
    }

    function cookingResourceSlotKey(containerType, index) {
        return String(containerType || '') + '|' + String(Math.floor(Number(index)));
    }

    function parseCookingResourceSlotKey(key) {
        if (key == null || typeof key !== 'string') return null;
        var p = key.indexOf('|');
        if (p <= 0) return null;
        var ct = key.slice(0, p);
        var idx = parseInt(key.slice(p + 1), 10);
        if (!isFinite(idx) || idx < 0) return null;
        return { containerType: ct, index: idx };
    }

    function resolveCookingSlotOrFirst(forcedSlot, predicateFn) {
        if (forcedSlot && forcedSlot.containerType != null && forcedSlot.index != null) {
            var arrF = getInventoryContainerArray(forcedSlot.containerType);
            var ix = Math.floor(Number(forcedSlot.index));
            if (!Array.isArray(arrF) || !(ix >= 0) || ix >= arrF.length) return null;
            var cellF = arrF[ix];
            if (!cellF || !cellF.item_id) return null;
            if (typeof predicateFn === 'function' && !predicateFn(cellF)) return null;
            return { containerType: String(forcedSlot.containerType), index: ix, item: cellF };
        }
        return findFirstContainerSlotByPredicate(predicateFn);
    }

    function findAllContainerSlotsByPredicate(predicateFn) {
        if (!IE || typeof predicateFn !== 'function') return [];
        var targets = [
            { type: 'pocket', arr: IE.getPocketArray ? IE.getPocketArray() : [] },
            { type: 'vest', arr: IE.getVestArray ? IE.getVestArray() : [] },
            { type: 'backpack', arr: IE.getBackpackArray ? IE.getBackpackArray() : [] }
        ];
        var out = [];
        var t, i;
        for (t = 0; t < targets.length; t++) {
            var arr = targets[t].arr;
            if (!Array.isArray(arr)) continue;
            for (i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                if (predicateFn(cell, targets[t].type, i)) {
                    out.push({ containerType: targets[t].type, index: i, item: cell });
                }
            }
        }
        return out;
    }

    function findFirstContainerSlotByPredicate(predicateFn) {
        if (!IE || typeof predicateFn !== 'function') return null;
        var targets = [
            { type: 'pocket', arr: IE.getPocketArray ? IE.getPocketArray() : [] },
            { type: 'vest', arr: IE.getVestArray ? IE.getVestArray() : [] },
            { type: 'backpack', arr: IE.getBackpackArray ? IE.getBackpackArray() : [] }
        ];
        var t, i;
        for (t = 0; t < targets.length; t++) {
            var arr = targets[t].arr;
            if (!Array.isArray(arr)) continue;
            for (i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                if (predicateFn(cell, targets[t].type, i)) {
                    return { containerType: targets[t].type, index: i, item: cell };
                }
            }
        }
        return null;
    }

    function getItemTemplateSafe(itemId) {
        if (!IE || typeof IE.getItemTemplate !== 'function' || !itemId) return null;
        return IE.getItemTemplate(itemId);
    }

    function hasItemById(itemId) {
        return !!findFirstContainerSlotByItemId(itemId);
    }

    function getItemWaterPoints(itemId) {
        var tpl = getItemTemplateSafe(itemId);
        var n = tpl && tpl.water_points != null ? parseInt(tpl.water_points, 10) : 0;
        return (isFinite(n) && n > 0) ? n : 0;
    }
    function getItemFuelPoints(itemId) {
        var tpl = getItemTemplateSafe(itemId);
        var n = tpl && tpl.fuel_points != null ? parseInt(tpl.fuel_points, 10) : 0;
        return (isFinite(n) && n > 0) ? n : 0;
    }

    /** 仅当物品模板显式 cooking_ingredient===true 时可作烹饪投料；缺省或 false 均不可。 */
    function isItemAllowedCookingIngredient(itemId) {
        var tpl = getItemTemplateSafe(itemId);
        return !!(tpl && tpl.cooking_ingredient === true);
    }

    // === Auto-generated Pharmacy Helper ===
    function isItemAllowedPharmacyIngredient(itemId) {
        var tpl = getItemTemplateSafe(itemId);
        return !!(tpl && tpl.pharmacy_ingredient === true);
    }

    function getInventoryCountByItemId(itemId) {
        if (!IE || !itemId) return 0;
        var total = 0;
        var groups = [
            IE.getPocketArray ? IE.getPocketArray() : [],
            IE.getVestArray ? IE.getVestArray() : [],
            IE.getBackpackArray ? IE.getBackpackArray() : []
        ];
        var g, i;
        for (g = 0; g < groups.length; g++) {
            var arr = groups[g];
            if (!Array.isArray(arr)) continue;
            for (i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                if (String(cell.item_id) !== String(itemId)) continue;
                total += (cell.count != null && cell.count > 0) ? parseInt(cell.count, 10) : 1;
            }
        }
        return total;
    }

    function normalizeCookingInputs(rawInputs) {
        if (!Array.isArray(rawInputs) || !rawInputs.length) return [];
        var byId = {};
        var i;
        for (i = 0; i < rawInputs.length; i++) {
            var r = rawInputs[i] || {};
            var id = r.item_id != null ? String(r.item_id).trim() : '';
            if (!id) continue;
            var c = parseInt(r.count, 10);
            if (!isFinite(c) || c <= 0) c = 1;
            byId[id] = (byId[id] || 0) + c;
        }
        var out = [];
        var keys = Object.keys(byId);
        for (i = 0; i < keys.length; i++) out.push({ item_id: keys[i], count: byId[keys[i]] });
        return out;
    }

    // === Auto-generated Pharmacy Helper ===
    function normalizePharmacyInputs(rawInputs) {
        if (!Array.isArray(rawInputs) || !rawInputs.length) return [];
        var byId = {};
        var i;
        for (i = 0; i < rawInputs.length; i++) {
            var r = rawInputs[i] || {};
            var id = r.item_id != null ? String(r.item_id).trim() : '';
            if (!id) continue;
            var c = parseInt(r.count, 10);
            if (!isFinite(c) || c <= 0) c = 1;
            byId[id] = (byId[id] || 0) + c;
        }
        var out = [];
        var keys = Object.keys(byId);
        for (i = 0; i < keys.length; i++) out.push({ item_id: keys[i], count: byId[keys[i]] });
        return out;
    }

    function toCountMap(list) {
        var m = {};
        var i;
        for (i = 0; i < list.length; i++) {
            var it = list[i] || {};
            var id = it.item_id != null ? String(it.item_id) : '';
            var c = parseInt(it.count, 10);
            if (!id || !isFinite(c) || c <= 0) continue;
            m[id] = (m[id] || 0) + c;
        }
        return m;
    }

    function recipeInputsSatisfiedBySelected(recipe, selectedInputs) {
        var selectedMap = toCountMap(selectedInputs || []);
        var reqs = Array.isArray(recipe && recipe.inputs) ? recipe.inputs : [];
        var j;
        for (j = 0; j < reqs.length; j++) {
            var need = reqs[j] || {};
            var id = need.item_id != null ? String(need.item_id) : '';
            var cnt = parseInt(need.count, 10);
            if (!isFinite(cnt) || cnt <= 0) cnt = 1;
            if (!id || (selectedMap[id] || 0) < cnt) return false;
        }
        return reqs.length > 0;
    }

    /** 盲配：仅按投料 multiset 是否包含配方需求命中；可选 methodFilter 限制 required_method。 */
    function matchCookingRecipesByInputs(selectedInputs, methodFilter) {
        var out = [];
        var i;
        var mf = methodFilter != null && String(methodFilter) !== '' ? String(methodFilter) : null;
        for (i = 0; i < cookingRecipes.length; i++) {
            var r = cookingRecipes[i] || {};
            var reqMethod = r.required_method != null ? String(r.required_method) : '';
            var recipeMethod = r.method_id != null ? String(r.method_id) : '';
            if (mf != null && reqMethod !== mf && recipeMethod !== mf && toUnifiedCookingMethodId(reqMethod) !== mf && toUnifiedCookingMethodId(recipeMethod) !== mf) continue;
            if (recipeInputsSatisfiedBySelected(r, selectedInputs)) out.push(r);
        }
        return out;
    }

    // === Auto-generated Pharmacy Helper ===
    function matchPharmacyRecipesByInputs(selectedInputs, methodFilter) {
        var out = [];
        var i;
        var mf = methodFilter != null && String(methodFilter) !== '' ? String(methodFilter) : null;
        for (i = 0; i < pharmacyRecipes.length; i++) {
            var r = pharmacyRecipes[i] || {};
            var reqMethod = r.required_method != null ? String(r.required_method) : '';
            var recipeMethod = r.method_id != null ? String(r.method_id) : '';
            if (mf != null && reqMethod !== mf && recipeMethod !== mf && toUnifiedPharmacyMethodId(reqMethod) !== mf && toUnifiedPharmacyMethodId(recipeMethod) !== mf) continue;
            if (recipeInputsSatisfiedBySelected(r, selectedInputs)) out.push(r);
        }
        return out;
    }

    /** 按 match_weight（缺省 1）加权随机选一条配方。 */
    function pickCookingRecipeWeighted(recipes) {
        if (!Array.isArray(recipes) || !recipes.length) return null;
        var total = 0;
        var i, w;
        var weights = [];
        for (i = 0; i < recipes.length; i++) {
            w = recipes[i].match_weight != null ? parseFloat(recipes[i].match_weight, 10) : 1;
            if (!isFinite(w) || w <= 0) w = 1;
            weights.push(w);
            total += w;
        }
        var roll = Math.random() * total;
        var acc = 0;
        for (i = 0; i < recipes.length; i++) {
            acc += weights[i];
            if (roll < acc) return recipes[i];
        }
        return recipes[recipes.length - 1];
    }

    // === Auto-generated Pharmacy Helper ===
    function pickPharmacyRecipeWeighted(recipes) {
        if (!Array.isArray(recipes) || !recipes.length) return null;
        var total = 0;
        var i, w;
        var weights = [];
        for (i = 0; i < recipes.length; i++) {
            w = recipes[i].match_weight != null ? parseFloat(recipes[i].match_weight, 10) : 1;
            if (!isFinite(w) || w <= 0) w = 1;
            weights.push(w);
            total += w;
        }
        var roll = Math.random() * total;
        var acc = 0;
        for (i = 0; i < recipes.length; i++) {
            acc += weights[i];
            if (roll < acc) return recipes[i];
        }
        return recipes[recipes.length - 1];
    }

    function consumeInventoryItemsByList(inputList) {
        var consumed = [];
        var i;
        for (i = 0; i < inputList.length; i++) {
            var entry = inputList[i] || {};
            var id = entry.item_id != null ? String(entry.item_id) : '';
            var need = parseInt(entry.count, 10);
            if (!id || !isFinite(need) || need <= 0) continue;
            var k;
            for (k = 0; k < need; k++) {
                var slot = findFirstContainerSlotByItemId(id);
                if (!slot) return { ok: false, consumed: consumed };
                var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
                if (!taken || !taken.success || !taken.item) return { ok: false, consumed: consumed };
                consumed.push(taken.item);
            }
        }
        return { ok: true, consumed: consumed };
    }

    function putItemsBack(items) {
        if (!Array.isArray(items) || !IE || typeof IE.putItemIntoDefaultContainer !== 'function') return;
        var i;
        for (i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it || !it.item_id) continue;
            IE.putItemIntoDefaultContainer(it);
        }
    }

    function advanceWorldTicks(n) {
        var times = parseInt(n, 10);
        if (!isFinite(times) || times <= 0) return;
        var i;
        for (i = 0; i < times; i++) {
            if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        }
    }

    // ---------------------------
    // Cooking craft (async, tick-driven; 21.10.1 / 21.10.3)
    // ---------------------------
    var cookingCraftIdleTimer = null;
    var pharmacyCraftIdleTimer = null;
    var COOKING_RECIPE_SYSTEM = 'life_cooking';
    var COOKING_DEFAULT_PROCESSOR_ID = 'processor.life_cooking.default';
    var cookingRecipeProcessorRegistered = false;
    var PHARMACY_RECIPE_SYSTEM = 'life_pharmacy';
    var PHARMACY_DEFAULT_PROCESSOR_ID = 'processor.life_pharmacy.default';
    var PHARMACY_BASE_STATION_UNLOCK_FLAG = 'npc_station_pharmacy_base_repaired';
    var PHARMACY_FUEL_MAX_POINTS = 100;
    var PHARMACY_WATER_MAX_POINTS = 100;
    var DEFAULT_PHARMACY_INSTALLED_ACCESSORIES = [];
    var pharmacyRecipeProcessorRegistered = false;

    function registerCookingRecipeProcessorIfNeeded() {
        if (cookingRecipeProcessorRegistered) return;
        if (!window.RecipeSystem || typeof window.RecipeSystem.registerProcessor !== 'function') return;
        window.RecipeSystem.registerProcessor(COOKING_DEFAULT_PROCESSOR_ID, function (payload) {
            var recipe = payload && payload.recipe && typeof payload.recipe === 'object' ? payload.recipe : {};
            var route = payload && payload.route && typeof payload.route === 'object' ? payload.route : {};
            var method = payload && payload.method && typeof payload.method === 'object' ? payload.method : {};
            var mainOut = recipe && recipe.main_output && typeof recipe.main_output === 'object' ? recipe.main_output : null;
            var bonusOut = Array.isArray(recipe && recipe.bonus_outputs) ? recipe.bonus_outputs : [];
            var failOut = route && route.failure_output && typeof route.failure_output === 'object' ? route.failure_output : null;
            return {
                selected_recipe_id: payload && payload.recipe_id ? String(payload.recipe_id) : '',
                method_id: method && method.method_id != null ? String(method.method_id) : '',
                route: route,
                main_output: mainOut,
                bonus_outputs: bonusOut,
                failure_output: failOut,
                base_success_rate: (route && route.base_success_rate != null)
                    ? route.base_success_rate
                    : (method && method.base_success_rate != null ? method.base_success_rate : null),
                base_output_quality_tier: (recipe && recipe.base_output_quality_tier != null) ? recipe.base_output_quality_tier : 0
            };
        });
        cookingRecipeProcessorRegistered = true;
    }

    function registerPharmacyRecipeProcessorIfNeeded() {
        if (pharmacyRecipeProcessorRegistered) return;
        if (!window.RecipeSystem || typeof window.RecipeSystem.registerProcessor !== 'function') return;
        window.RecipeSystem.registerProcessor(PHARMACY_DEFAULT_PROCESSOR_ID, function (payload) {
            var recipe = payload && payload.recipe && typeof payload.recipe === 'object' ? payload.recipe : {};
            var route = payload && payload.route && typeof payload.route === 'object' ? payload.route : {};
            var method = payload && payload.method && typeof payload.method === 'object' ? payload.method : {};
            var mainOut = recipe && recipe.main_output && typeof recipe.main_output === 'object' ? recipe.main_output : null;
            var bonusOut = Array.isArray(recipe && recipe.bonus_outputs) ? recipe.bonus_outputs : [];
            var failOut = route && route.failure_output && typeof route.failure_output === 'object' ? route.failure_output : null;
            return {
                selected_recipe_id: payload && payload.recipe_id ? String(payload.recipe_id) : '',
                method_id: method && method.method_id != null ? String(method.method_id) : '',
                route: route,
                main_output: mainOut,
                bonus_outputs: bonusOut,
                failure_output: failOut,
                base_success_rate: (route && route.base_success_rate != null)
                    ? route.base_success_rate
                    : (method && method.base_success_rate != null ? method.base_success_rate : null),
                base_output_quality_tier: (recipe && recipe.base_output_quality_tier != null) ? recipe.base_output_quality_tier : 0
            };
        });
        pharmacyRecipeProcessorRegistered = true;
    }

    /** 灶台工艺 id 与 cooking-methods.json 键一致（如 boil_stew）；统一表 method_id 为 life_cooking.boil_stew。 */
    function toUnifiedCookingMethodId(legacyMethodId) {
        var s = String(legacyMethodId || '').trim();
        if (!s) return '';
        if (s.indexOf('life_cooking.') === 0) return s;
        return 'life_cooking.' + s;
    }

    function toUnifiedPharmacyMethodId(legacyMethodId) {
        var s = String(legacyMethodId || '').trim();
        if (!s) return '';
        if (s.indexOf('life_pharmacy.') === 0) return s;
        return 'life_pharmacy.' + s;
    }

    function readMethodCostValue(methodObj, key, legacyKey) {
        var m = methodObj && typeof methodObj === 'object' ? methodObj : {};
        var cost = m.cost && typeof m.cost === 'object' ? m.cost : null;
        var v = cost && cost[key] != null ? Number(cost[key]) : NaN;
        if (!isFinite(v)) v = Number(m[legacyKey]);
        if (!isFinite(v)) v = 0;
        return Math.max(0, Math.floor(v));
    }

    function getPharmacyMethodDisplayName(methodId, methodObj) {
        var mid = methodId != null ? String(methodId) : '';
        var m = methodObj && typeof methodObj === 'object' ? methodObj : {};
        if (m.name != null && String(m.name).trim() !== '') return String(m.name);
        var keyRaw = mid.indexOf('life_pharmacy.') === 0 ? mid.slice('life_pharmacy.'.length) : mid;
        var key = 'pharmacy.method.' + keyRaw;
        try {
            if (window.UIText && typeof window.UIText.t === 'function') {
                return window.UIText.t(key);
            }
        } catch (e0) { /* fallback */ }
        return mid;
    }

    function tryResolveCookingByUnifiedRoute(methodId, selectedInputs) {
        if (!window.RecipeSystem || typeof window.RecipeSystem.craft !== 'function') {
            return { ok: false, reason: 'recipe_system_unavailable' };
        }
        registerCookingRecipeProcessorIfNeeded();
        var ret = window.RecipeSystem.craft({
            recipe_system: COOKING_RECIPE_SYSTEM,
            method_id: toUnifiedCookingMethodId(methodId),
            inputs: Array.isArray(selectedInputs) ? selectedInputs : []
        });
        if (!ret || ret.ok !== true) {
            return {
                ok: false,
                reason: 'recipe_system_craft_failed',
                error: ret && ret.error ? ret.error : null
            };
        }
        var data = ret.result && typeof ret.result === 'object' ? ret.result : {};
        return { ok: true, data: data };
    }

    // === Auto-generated Pharmacy Helper ===
    function tryResolvePharmacyByUnifiedRoute(methodId, selectedInputs) {
        if (!window.RecipeSystem || typeof window.RecipeSystem.craft !== 'function') {
            return { ok: false, reason: 'recipe_system_unavailable' };
        }
        if (typeof registerPharmacyRecipeProcessorIfNeeded === 'function') {
            registerPharmacyRecipeProcessorIfNeeded();
        }
        var ret = window.RecipeSystem.craft({
            recipe_system: PHARMACY_RECIPE_SYSTEM,
            method_id: toUnifiedPharmacyMethodId(methodId),
            inputs: Array.isArray(selectedInputs) ? selectedInputs : []
        });
        if (!ret || ret.ok !== true) {
            return {
                ok: false,
                reason: 'recipe_system_craft_failed',
                error: ret && ret.error ? ret.error : null
            };
        }
        var data = ret.result && typeof ret.result === 'object' ? ret.result : {};
        return { ok: true, data: data };
    }

    function getActiveCookingCraft() {
        var cs = getCookingStationState();
        var ac = cs && cs.active_craft && typeof cs.active_craft === 'object' ? cs.active_craft : null;
        if (!ac) return null;
        var rt = Math.max(0, Math.floor(Number(ac.remaining_ticks) || 0));
        if (!(rt > 0)) return null;
        return Object.assign({}, ac, { remaining_ticks: rt });
    }

    // === Auto-generated Pharmacy Helper ===
    function getActivePharmacyCraft() {
        var cs = getPharmacyStationState();
        var ac = cs && cs.active_craft && typeof cs.active_craft === 'object' ? cs.active_craft : null;
        if (!ac) return null;
        var rt = Math.max(0, Math.floor(Number(ac.remaining_ticks) || 0));
        if (!(rt > 0)) return null;
        return Object.assign({}, ac, { remaining_ticks: rt });
    }

    function clearActiveCookingCraft() {
        var cs = getCookingStationState();
        if (cs) cs.active_craft = null;
    }

    // === Auto-generated Pharmacy Helper ===
    function clearActivePharmacyCraft() {
        var cs = getPharmacyStationState();
        if (cs) cs.active_craft = null;
    }

    function stopCookingCraftIdle() {
        if (cookingCraftIdleTimer) {
            try { clearInterval(cookingCraftIdleTimer); } catch (e0) { /* ignore */ }
            cookingCraftIdleTimer = null;
        }
    }

    function startCookingCraftIdleIfNeeded() {
        if (cookingCraftIdleTimer) return;
        if (!getActiveCookingCraft()) return;
        cookingCraftIdleTimer = setInterval(function () {
            if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        }, getIdleTickMs());
    }

    // === Auto-generated Pharmacy Helper ===
    function startPharmacyCraftIdleIfNeeded() {
        if (pharmacyCraftIdleTimer) return;
        if (!getActivePharmacyCraft()) return;
        pharmacyCraftIdleTimer = setInterval(function () {
            if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        }, getIdleTickMs());
    }

    function stopPharmacyCraftIdle() {
        if (pharmacyCraftIdleTimer) {
            try { clearInterval(pharmacyCraftIdleTimer); } catch (e0) { /* ignore */ }
            pharmacyCraftIdleTimer = null;
        }
    }

    function finalizeCookingCraftNow(craftSnap, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var craft = craftSnap && typeof craftSnap === 'object' ? craftSnap : getActiveCookingCraft();
        // finalize 前清掉 active_craft，防止重入
        clearActiveCookingCraft();
        stopCookingCraftIdle();

        if (!craft || !craft.method_id) return;
        var mid = String(craft.method_id).trim();
        var m = cookingMethods && cookingMethods[mid] ? cookingMethods[mid] : null;
        var failId = cookingFailureItemId;
        var forceFailure = !!opts.force_failure;
        var selected = normalizeCookingInputs(craft.inputs || []);
        var matched = matchCookingRecipesByInputs(selected, mid);

        function grantItemOrDrop(itemId, qualityTier) {
            var outInst = { item_id: itemId, count: 1, quality_tier: qualityTier || 0 };
            var placed = IE.putItemIntoDefaultContainer(outInst);
            if (!placed || !placed.placed) {
                var st0 = E.getState();
                if (typeof IE.addItemToGround === 'function') IE.addItemToGround(st0.mapId, st0.x, st0.y, outInst);
            }
        }

        if (forceFailure) {
            grantItemOrDrop(failId, 0);
            showMsg(ui('cooking.msg.done_fail', { item: failId }), 'warn');
            if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
            if (typeof updateStatusPanel === 'function') updateStatusPanel();
            if (window.SceneRenderer) window.SceneRenderer.render();
            return;
        }

        var pick = null;
        var pickRecipeId = '';
        var pickBaseSuccessRate = null;
        var pickBaseOutputQualityTier = 0;
        var pickMainOutput = null;
        var pickBonusOutputs = [];
        var pickFailureOutput = null;
        var unifiedRet = tryResolveCookingByUnifiedRoute(mid, selected);
        if (unifiedRet.ok && unifiedRet.data) {
            var routeData = unifiedRet.data;
            pickRecipeId = routeData.selected_recipe_id || '';
            pickMainOutput = routeData.main_output && typeof routeData.main_output === 'object' ? routeData.main_output : null;
            pickBonusOutputs = Array.isArray(routeData.bonus_outputs) ? routeData.bonus_outputs : [];
            pickFailureOutput = routeData.failure_output && typeof routeData.failure_output === 'object' ? routeData.failure_output : null;
            pickBaseSuccessRate = routeData.base_success_rate;
            pickBaseOutputQualityTier = routeData.base_output_quality_tier != null ? routeData.base_output_quality_tier : 0;
            if (pickMainOutput && pickMainOutput.item_id) {
                pick = {
                    output_item_id: String(pickMainOutput.item_id),
                    recipe_id: pickRecipeId,
                    bonus_outputs: pickBonusOutputs,
                    failure_output: pickFailureOutput
                };
            }
        } else if (unifiedRet.error && unifiedRet.error.code !== 'RECIPE_NO_MATCHED_RECIPE') {
            try { console.warn('[Cooking][UnifiedRoute] craft failed:', unifiedRet.error); } catch (eLog0) { /* ignore */ }
        }
        if (!pick) {
            if (!matched.length) {
                grantItemOrDrop(failId, 0);
                showMsg(ui('cooking.msg.no_recipe_fail', { item: failId }), 'warn');
                if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
                if (window.SceneRenderer) window.SceneRenderer.render();
                return;
            }
            pick = pickCookingRecipeWeighted(matched);
            if (!pick) {
                grantItemOrDrop(failId, 0);
                showMsg(ui('cooking.msg.done_fail', { item: failId }), 'warn');
                if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
                if (window.SceneRenderer) window.SceneRenderer.render();
                return;
            }
            pickRecipeId = pick.recipe_id ? String(pick.recipe_id) : '';
            pickBaseSuccessRate = pick.base_success_rate != null ? pick.base_success_rate : (m ? m.base_success_rate : 1);
            pickBaseOutputQualityTier = pick.base_output_quality_tier != null ? pick.base_output_quality_tier : 0;
        }

        var pq = window.ProductionQuality;
        var cookingLv = Math.max(0, Math.min(COOKING_SKILL_MAX_LEVEL, getCookingSkillLevel()));
        var evalRes = (pq && typeof pq.evaluateProduction === 'function')
            ? pq.evaluateProduction({
                base_success_rate: pickBaseSuccessRate != null ? pickBaseSuccessRate : (m ? m.base_success_rate : 1),
                // 烹饪系统单独处理技能成功率与溢出品质，不复用通用 skill_level 乘区。
                skill_level: 0,
                input_items: Array.isArray(craft.consumed_items) ? craft.consumed_items.slice() : [],
                base_output_quality_tier: pickBaseOutputQualityTier
            })
            : { success: true, output_quality_tier: 0, success_rate: 1 };
        var baseSuccessRate = Math.max(0, Number(evalRes.success_rate) || 0);
        var bonusFromCookingLv = cookingLv * COOKING_SUCCESS_BONUS_PER_LEVEL;
        var successRateRaw = baseSuccessRate + bonusFromCookingLv;
        var successRateFinal = getProductionSuccessRateWithMoodDelta(successRateRaw);
        var overflowRate = Math.max(0, successRateRaw - 1);
        var isMaxCookingLv = cookingLv >= COOKING_SKILL_MAX_LEVEL;
        evalRes.success = isMaxCookingLv ? true : (Math.random() < successRateFinal);
        evalRes.success_rate = successRateFinal;
        if (evalRes.success) {
            var qOut = (evalRes.output_quality_tier != null) ? Number(evalRes.output_quality_tier) : 0;
            if ((Math.random() < Math.max(0, Math.min(1, overflowRate))) && qOut < 5) qOut += 1;
            evalRes.output_quality_tier = qOut;
        } else {
            evalRes.output_quality_tier = null;
        }

        var outputItemId = failId;
        if (evalRes.success) {
            if (pickMainOutput && pickMainOutput.item_id) outputItemId = String(pickMainOutput.item_id);
            else outputItemId = pick.output_item_id;
        } else if (pickFailureOutput && pickFailureOutput.item_id) {
            outputItemId = String(pickFailureOutput.item_id);
        } else if (pick && pick.failure_output && pick.failure_output.item_id) {
            outputItemId = String(pick.failure_output.item_id);
        }
        var outputQuality = evalRes.success ? (evalRes.output_quality_tier != null ? evalRes.output_quality_tier : 0) : 0;
        if (evalRes.success && pickRecipeId) markCookingRecipeKnown(pickRecipeId);
        if (evalRes.success) addCookingSuccessProficiency();

        grantItemOrDrop(outputItemId, outputQuality);
        if (evalRes.success && Array.isArray(pickBonusOutputs) && pickBonusOutputs.length) {
            var bi;
            for (bi = 0; bi < pickBonusOutputs.length; bi++) {
                var brow = pickBonusOutputs[bi] || {};
                var bid = brow.item_id != null ? String(brow.item_id) : '';
                var bcnt = Math.max(1, parseInt(brow.count, 10) || 1);
                var bchance = Number(brow.chance);
                if (!bid) continue;
                if (!(bchance >= 0)) bchance = 1;
                bchance = Math.max(0, Math.min(1, bchance));
                if (Math.random() >= bchance) continue;
                var bk;
                for (bk = 0; bk < bcnt; bk++) grantItemOrDrop(bid, outputQuality);
            }
        }
        showMsg(
            evalRes.success
                ? ui('cooking.msg.done_ok', { item: outputItemId, method: mid })
                : ui('cooking.msg.done_fail', { item: failId }),
            evalRes.success ? 'success' : 'warn'
        );
        if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function tickCookingCraftAfterWorldTick() {
        var cs = getCookingStationState();
        if (!cs || !cs.active_craft || typeof cs.active_craft !== 'object') return;
        var rt = Math.max(0, Math.floor(Number(cs.active_craft.remaining_ticks) || 0));
        if (!(rt > 0)) {
            cs.active_craft = null;
            stopCookingCraftIdle();
            return;
        }
        rt -= 1;
        cs.active_craft.remaining_ticks = rt;
        if (rt <= 0) {
            finalizeCookingCraftNow(cs.active_craft);
        }
        if (cookingStationPanelOpen) renderCookingStationPanel();
    }

    function getProductionSuccessRateWithMoodDelta(baseRateRaw) {
        var successRateRaw = Math.max(0, Number(baseRateRaw) || 0);
        if (window.BuffSystem && typeof window.BuffSystem.getProductionSuccessRateDeltaPercent === 'function') {
            var moodDeltaPct = Number(window.BuffSystem.getProductionSuccessRateDeltaPercent('player')) || 0;
            successRateRaw += (moodDeltaPct / 100);
        }
        return Math.max(0, Math.min(1, successRateRaw));
    }

    function markPharmacyRecipeKnown(recipeId) {
        if (!recipeId || !window.SceneCtx) return;
        window.SceneCtx.known_pharmacy_recipes = window.SceneCtx.known_pharmacy_recipes || {};
        var rid = String(recipeId);
        window.SceneCtx.known_pharmacy_recipes[rid] = true;
        window.SceneCtx.known_recipe_ids_by_system = window.SceneCtx.known_recipe_ids_by_system || {};
        if (!window.SceneCtx.known_recipe_ids_by_system[PHARMACY_RECIPE_SYSTEM]) {
            window.SceneCtx.known_recipe_ids_by_system[PHARMACY_RECIPE_SYSTEM] = {};
        }
        window.SceneCtx.known_recipe_ids_by_system[PHARMACY_RECIPE_SYSTEM][rid] = true;
    }

    function finalizePharmacyCraftNow(craftSnap, options) {
        var opts = options && typeof options === 'object' ? options : {};
        var craft = craftSnap && typeof craftSnap === 'object' ? craftSnap : getActivePharmacyCraft();
        clearActivePharmacyCraft();
        stopPharmacyCraftIdle();

        if (!craft || !craft.method_id) return;
        var mid = String(craft.method_id).trim();
        var m = pharmacyMethods && pharmacyMethods[mid] ? pharmacyMethods[mid] : null;
        var failId = pharmacyFailureItemId;
        var forceFailure = !!opts.force_failure;
        var selected = normalizePharmacyInputs(craft.inputs || []);
        var matched = matchPharmacyRecipesByInputs(selected, mid);

        function grantItemOrDrop(itemId, qualityTier) {
            var outInst = { item_id: itemId, count: 1, quality_tier: qualityTier || 0 };
            var placed = IE.putItemIntoDefaultContainer(outInst);
            if (!placed || !placed.placed) {
                var st0 = E.getState();
                if (typeof IE.addItemToGround === 'function') IE.addItemToGround(st0.mapId, st0.x, st0.y, outInst);
            }
        }

        if (forceFailure) {
            grantItemOrDrop(failId, 0);
            showMsg(ui('pharmacy.msg.done_fail', { item: failId }), 'warn');
            if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
            if (typeof updateStatusPanel === 'function') updateStatusPanel();
            if (window.SceneRenderer) window.SceneRenderer.render();
            return;
        }

        var pick = null;
        var pickRecipeId = '';
        var pickBaseSuccessRate = null;
        var pickBaseOutputQualityTier = 0;
        var pickMainOutput = null;
        var pickBonusOutputs = [];
        var pickFailureOutput = null;
        var unifiedRet = tryResolvePharmacyByUnifiedRoute(mid, selected);
        if (unifiedRet.ok && unifiedRet.data) {
            var routeData = unifiedRet.data;
            pickRecipeId = routeData.selected_recipe_id || '';
            pickMainOutput = routeData.main_output && typeof routeData.main_output === 'object' ? routeData.main_output : null;
            pickBonusOutputs = Array.isArray(routeData.bonus_outputs) ? routeData.bonus_outputs : [];
            pickFailureOutput = routeData.failure_output && typeof routeData.failure_output === 'object' ? routeData.failure_output : null;
            pickBaseSuccessRate = routeData.base_success_rate;
            pickBaseOutputQualityTier = routeData.base_output_quality_tier != null ? routeData.base_output_quality_tier : 0;
            if (pickMainOutput && pickMainOutput.item_id) {
                pick = {
                    output_item_id: String(pickMainOutput.item_id),
                    recipe_id: pickRecipeId,
                    bonus_outputs: pickBonusOutputs,
                    failure_output: pickFailureOutput
                };
            }
        } else if (unifiedRet.error && unifiedRet.error.code !== 'RECIPE_NO_MATCHED_RECIPE') {
            try { console.warn('[Pharmacy][UnifiedRoute] craft failed:', unifiedRet.error); } catch (eLog0) { /* ignore */ }
        }
        if (!pick) {
            if (!matched.length) {
                grantItemOrDrop(failId, 0);
                showMsg(ui('pharmacy.msg.no_recipe_fail', { item: failId }), 'warn');
                if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
                if (window.SceneRenderer) window.SceneRenderer.render();
                return;
            }
            pick = pickPharmacyRecipeWeighted(matched);
            if (!pick) {
                grantItemOrDrop(failId, 0);
                showMsg(ui('pharmacy.msg.done_fail', { item: failId }), 'warn');
                if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
                if (window.SceneRenderer) window.SceneRenderer.render();
                return;
            }
            pickRecipeId = pick.recipe_id ? String(pick.recipe_id) : '';
            pickBaseSuccessRate = pick.base_success_rate != null ? pick.base_success_rate : (m ? m.base_success_rate : 1);
            pickBaseOutputQualityTier = pick.base_output_quality_tier != null ? pick.base_output_quality_tier : 0;
        }

        var pq = window.ProductionQuality;
        var evalRes = (pq && typeof pq.evaluateProduction === 'function')
            ? pq.evaluateProduction({
                base_success_rate: pickBaseSuccessRate != null ? pickBaseSuccessRate : (m ? m.base_success_rate : 1),
                skill_level: 0,
                input_items: Array.isArray(craft.consumed_items) ? craft.consumed_items.slice() : [],
                base_output_quality_tier: pickBaseOutputQualityTier
            })
            : { success: true, output_quality_tier: 0, success_rate: 1 };
        var pharmacySuccessRaw = Math.max(0, Number(evalRes.success_rate) || 0);
        var pharmacySuccessFinal = getProductionSuccessRateWithMoodDelta(pharmacySuccessRaw);
        evalRes.success_rate = pharmacySuccessFinal;
        evalRes.success = Math.random() < pharmacySuccessFinal;
        var outputItemId = failId;
        if (evalRes.success) {
            if (pickMainOutput && pickMainOutput.item_id) outputItemId = String(pickMainOutput.item_id);
            else outputItemId = pick.output_item_id;
        } else if (pickFailureOutput && pickFailureOutput.item_id) {
            outputItemId = String(pickFailureOutput.item_id);
        } else if (pick && pick.failure_output && pick.failure_output.item_id) {
            outputItemId = String(pick.failure_output.item_id);
        }
        var outputQuality = evalRes.success ? (evalRes.output_quality_tier != null ? evalRes.output_quality_tier : 0) : 0;
        if (evalRes.success && pickRecipeId) markPharmacyRecipeKnown(pickRecipeId);

        grantItemOrDrop(outputItemId, outputQuality);
        if (evalRes.success && Array.isArray(pickBonusOutputs) && pickBonusOutputs.length) {
            var bi;
            for (bi = 0; bi < pickBonusOutputs.length; bi++) {
                var brow = pickBonusOutputs[bi] || {};
                var bid = brow.item_id != null ? String(brow.item_id) : '';
                var bcnt = Math.max(1, parseInt(brow.count, 10) || 1);
                var bchance = Number(brow.chance);
                if (!bid) continue;
                if (!(bchance >= 0)) bchance = 1;
                bchance = Math.max(0, Math.min(1, bchance));
                if (Math.random() >= bchance) continue;
                var bk;
                for (bk = 0; bk < bcnt; bk++) grantItemOrDrop(bid, outputQuality);
            }
        }
        showMsg(
            evalRes.success
                ? ui('pharmacy.msg.done_ok', { item: outputItemId, method: mid })
                : ui('pharmacy.msg.done_fail', { item: failId }),
            evalRes.success ? 'success' : 'warn'
        );
        if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function tickPharmacyCraftAfterWorldTick() {
        var cs = getPharmacyStationState();
        if (!cs || !cs.active_craft || typeof cs.active_craft !== 'object') return;
        var rt = Math.max(0, Math.floor(Number(cs.active_craft.remaining_ticks) || 0));
        if (!(rt > 0)) {
            cs.active_craft = null;
            stopPharmacyCraftIdle();
            return;
        }
        rt -= 1;
        cs.active_craft.remaining_ticks = rt;
        if (rt <= 0) {
            finalizePharmacyCraftNow(cs.active_craft);
        }
        if (pharmacyStationPanelOpen) renderPharmacyStationPanel();
    }

    function tickPharmacyTempStationsAfterWorldTick() {
        // 制药台暂未启用临时工位；保留空函数避免 tick patch 调用缺失。
    }

    function tryPharmacyAtStation(methodId, inputItems) {
        if (guardPlayerActionBlocked(ACTION_TYPES.CRAFT)) {
            return { ok: false, reason: 'action_disabled', action_type: ACTION_TYPES.CRAFT };
        }
        var stationCtx = getCurrentPharmacyStationContext();
        if (!stationCtx) return { ok: false, reason: 'not_on_pharmacy_station' };
        if (isPharmacyUiBlockedByRepairForContext(stationCtx)) {
            return { ok: false, reason: 'pharmacy_station_repair_locked' };
        }
        if (methodId == null || !Array.isArray(inputItems)) return { ok: false, reason: 'bad_args' };
        if (getActivePharmacyCraft()) return { ok: false, reason: 'craft_in_progress' };
        var mid = String(methodId).trim();
        if (!mid) return { ok: false, reason: 'method_required' };
        var m = pharmacyMethods && pharmacyMethods[mid] ? pharmacyMethods[mid] : null;
        if (!m) return { ok: false, reason: 'method_not_found', method_id: mid };
        if (!isPharmacyMethodUnlockedAtStation(mid, stationCtx)) {
            return {
                ok: false,
                reason: 'pharmacy_method_locked',
                method_id: mid,
                required_accessory_item_id: m.requires_accessory_item_id != null ? m.requires_accessory_item_id : null
            };
        }

        var selected = normalizePharmacyInputs(inputItems);
        if (!selected.length) return { ok: false, reason: 'empty_inputs' };
        var i;
        for (i = 0; i < selected.length; i++) {
            var sid = selected[i].item_id;
            if (!isItemAllowedPharmacyIngredient(sid)) {
                return { ok: false, reason: 'not_pharmacy_ingredient', item_id: sid };
            }
            if (getInventoryCountByItemId(sid) < selected[i].count) {
                return { ok: false, reason: 'missing_input_items', item_id: sid };
            }
        }

        var needFuel = readMethodCostValue(m, 'fuel', 'fuel_cost');
        var needTicks = readMethodCostValue(m, 'ticks', 'craft_ticks');
        var needStamina = readMethodCostValue(m, 'stamina', 'stamina_cost');
        var cs = getPharmacyStationState();
        var curFuel = parseInt(cs.fuel_points, 10) || 0;
        if (curFuel < needFuel) return { ok: false, reason: 'insufficient_fuel', need: needFuel, current: curFuel };
        var survState = window.Survival && typeof window.Survival.getState === 'function' ? window.Survival.getState() : null;
        var curStamina = survState ? Number(survState.stamina || 0) : 0;
        if (curStamina < needStamina) return { ok: false, reason: 'insufficient_stamina', need: needStamina, current: curStamina };
        if (IE && typeof IE.canAcceptItem === 'function' && !IE.canAcceptItem()) {
            return { ok: false, reason: 'inventory_full' };
        }

        var consumedRes = consumeInventoryItemsByList(selected);
        if (!consumedRes.ok) {
            putItemsBack(consumedRes.consumed || []);
            return { ok: false, reason: 'consume_inputs_failed' };
        }

        cs.fuel_points = curFuel - needFuel;
        if (window.Survival && typeof window.Survival.consumeStamina === 'function' && needStamina > 0) {
            window.Survival.consumeStamina(needStamina);
        }

        var cs2 = getPharmacyStationState();
        var gt = window.GameTime && typeof window.GameTime.getState === 'function' ? window.GameTime.getState() : null;
        cs2.active_craft = {
            remaining_ticks: Math.max(1, needTicks),
            started_total_ticks: gt && typeof gt.totalTicks === 'number' ? gt.totalTicks : 0,
            method_id: mid,
            inputs: selected,
            consumed_items: consumedRes.consumed || [],
            station_ref: {
                station_type: stationCtx.station_type || 'main',
                map_id: stationCtx.map_id,
                x: stationCtx.x,
                y: stationCtx.y
            }
        };
        stopGatheringIdle();
        patchSurvivalTickForPharmacyCraftOnce();
        startPharmacyCraftIdleIfNeeded();
        showMsg(ui('pharmacy.msg.started', { n: Math.max(1, needTicks) }), 'info');
        if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (window.SceneRenderer) window.SceneRenderer.render();
        return {
            ok: true,
            started: true,
            method_id: mid,
            remaining_ticks: Math.max(1, needTicks),
            consumed: { fuel: needFuel, ticks: needTicks, stamina: needStamina }
        };
    }

    function isActiveCraftOnTempStation(mapId, x, y) {
        var cs = getCookingStationState();
        var ac = cs && cs.active_craft && typeof cs.active_craft === 'object' ? cs.active_craft : null;
        if (!ac || !ac.station_ref || typeof ac.station_ref !== 'object') return false;
        var ref = ac.station_ref;
        return String(ref.station_type || '') === 'temp'
            && String(ref.map_id || '') === String(mapId || '')
            && Math.floor(Number(ref.x)) === Math.floor(Number(x))
            && Math.floor(Number(ref.y)) === Math.floor(Number(y));
    }

    function tickCookingTempStationsAfterWorldTick() {
        var gt = window.GameTime && typeof window.GameTime.getState === 'function' ? window.GameTime.getState() : null;
        var nowTick = gt && typeof gt.totalTicks === 'number' ? Math.max(0, Math.floor(gt.totalTicks)) : 0;
        var arr = getCookingTempStationsRuntime();
        if (!arr.length) return;
        var changed = false;
        var i;
        for (i = arr.length - 1; i >= 0; i--) {
            var e = arr[i];
            if (nowTick < e.despawn_tick) continue;
            var hasActiveCraft = isActiveCraftOnTempStation(e.map_id, e.x, e.y);
            if (hasActiveCraft) {
                var cs = getCookingStationState();
                var ac = cs && cs.active_craft && typeof cs.active_craft === 'object' ? cs.active_craft : null;
                if (ac) finalizeCookingCraftNow(ac, { force_failure: true, reason: 'temp_station_despawn' });
            }
            arr.splice(i, 1);
            changed = true;
            markCellDirty(e.map_id, e.x, e.y);
        }
        if (changed) {
            syncCookingTempStationsIntoMaps();
            if (cookingStationPanelOpen) renderCookingStationPanel();
            if (window.SceneRenderer) window.SceneRenderer.render();
        }
    }

    function findAdjacentStandableCellAround(x, y) {
        if (!E || typeof E.canStandAt !== 'function') return null;
        var dirsR1 = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: -1 },
            { dx: 1, dy: 1 },
            { dx: -1, dy: 1 },
            { dx: -1, dy: -1 }
        ];
        var dirsR2 = [
            { dx: 0, dy: -2 }, { dx: 1, dy: -2 }, { dx: 2, dy: -2 }, { dx: 2, dy: -1 },
            { dx: 2, dy: 0 }, { dx: 2, dy: 1 }, { dx: 2, dy: 2 }, { dx: 1, dy: 2 },
            { dx: 0, dy: 2 }, { dx: -1, dy: 2 }, { dx: -2, dy: 2 }, { dx: -2, dy: 1 },
            { dx: -2, dy: 0 }, { dx: -2, dy: -1 }, { dx: -2, dy: -2 }, { dx: -1, dy: -2 }
        ];
        var i;
        for (i = 0; i < dirsR1.length; i++) {
            var nx = (x | 0) + dirsR1[i].dx;
            var ny = (y | 0) + dirsR1[i].dy;
            if (E.canStandAt(nx, ny)) return { x: nx, y: ny };
        }
        for (i = 0; i < dirsR2.length; i++) {
            var nx2 = (x | 0) + dirsR2[i].dx;
            var ny2 = (y | 0) + dirsR2[i].dy;
            if (E.canStandAt(nx2, ny2)) return { x: nx2, y: ny2 };
        }
        return null;
    }

    // NPC 上班后强占其工作格：若玩家占格，立即挤到该格邻近可用位（不额外推进 tick）。
    function resolveNpcHardOccupancyAfterWorldTick() {
        if (!E || typeof E.getState !== 'function' || typeof E.getMap !== 'function' || typeof E.setState !== 'function') return false;
        if (!window.NPCSystem || typeof window.NPCSystem.isNpcPresentNow !== 'function') return false;
        var st = E.getState();
        var map = E.getMap();
        if (!st || !map || !Array.isArray(map.npcs) || !map.npcs.length) return false;

        var px = st.x | 0;
        var py = st.y | 0;
        var i;
        for (i = 0; i < map.npcs.length; i++) {
            var n = map.npcs[i];
            if (!n) continue;
            var nx = n.x | 0;
            var ny = n.y | 0;
            if (nx !== px || ny !== py) continue;
            var npcId = n.npc_id != null ? String(n.npc_id) : '';
            if (!npcId) continue;
            if (!window.NPCSystem.isNpcPresentNow(npcId)) continue;
            var target = findAdjacentStandableCellAround(nx, ny);
            if (!target) {
                showMsg('NPC 上班占位冲突：周围无可用格，玩家暂留原地。', 'warn');
                return false;
            }
            E.setState(st.mapId, target.x, target.y);
            if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                window.SceneCtx.pushDirtyCell(nx, ny);
                window.SceneCtx.pushDirtyCell(target.x, target.y);
            }
            showMsg('NPC 已上班，你被挤到了旁边。', 'info');
            return true;
        }
        return false;
    }

    function patchSurvivalTickForCookingCraftOnce() {
        if (!window.Survival || typeof window.Survival.advanceTick !== 'function') return;
        if (window.Survival.__cookingCraftPatched) return;
        var oldAdvance = window.Survival.advanceTick;
        window.Survival.advanceTick = function () {
            var ret = oldAdvance.apply(this, arguments);
            try { resolveNpcHardOccupancyAfterWorldTick(); } catch (e2) { /* ignore */ }
            try { tickCookingTempStationsAfterWorldTick(); } catch (e1) { /* ignore */ }
            try { tickCookingCraftAfterWorldTick(); } catch (e0) { /* ignore */ }
            try {
                if (window.CompostSystem && typeof window.CompostSystem.onWorldTick === 'function') {
                    window.CompostSystem.onWorldTick();
                }
            } catch (e3) { /* ignore */ }
            try {
                if (compostStationPanelOpen) renderCompostStationPanel();
            } catch (e4) { /* ignore */ }
            return ret;
        };
        window.Survival.__cookingCraftPatched = true;
    }

    // === Auto-generated Pharmacy Helper ===
    function patchSurvivalTickForPharmacyCraftOnce() {
        if (!window.Survival || typeof window.Survival.advanceTick !== 'function') return;
        if (window.Survival.__pharmacyCraftPatched) return;
        var oldAdvance = window.Survival.advanceTick;
        window.Survival.advanceTick = function () {
            var ret = oldAdvance.apply(this, arguments);
            try { resolveNpcHardOccupancyAfterWorldTick(); } catch (e2) { /* ignore */ }
            try { tickPharmacyTempStationsAfterWorldTick(); } catch (e1) { /* ignore */ }
            try { tickPharmacyCraftAfterWorldTick(); } catch (e0) { /* ignore */ }
            try {
                if (window.CompostSystem && typeof window.CompostSystem.onWorldTick === 'function') {
                    window.CompostSystem.onWorldTick();
                }
            } catch (e3) { /* ignore */ }
            try {
                if (compostStationPanelOpen) renderCompostStationPanel();
            } catch (e4) { /* ignore */ }
            return ret;
        };
        window.Survival.__pharmacyCraftPatched = true;
    }

    var COOKING_SKILL_MAX_LEVEL = 100;
    var COOKING_MAX_PROFICIENCY_USES = 5000000;
    var COOKING_SUCCESS_BONUS_PER_LEVEL = 0.005;

    function getCookingSkillLevel() {
        if (IE && typeof IE.getSkillLevel === 'function') {
            var lv = parseInt(IE.getSkillLevel('life_cooking'), 10);
            if (isFinite(lv) && lv > 0) return lv;
        }
        return 0;
    }

    function getCookingLevelBySuccessUses(successUses) {
        var uses = Math.max(0, parseInt(successUses, 10) || 0);
        // 对齐生活技能：以累计使用次数驱动成长，5000000 次达到满级 100。
        var ratio = Math.max(0, Math.min(1, uses / COOKING_MAX_PROFICIENCY_USES));
        return Math.max(1, Math.min(COOKING_SKILL_MAX_LEVEL, 1 + Math.floor(ratio * (COOKING_SKILL_MAX_LEVEL - 1))));
    }

    function recalcCharacterStatsFromIE() {
        if (!window.CharacterAttributes || typeof window.CharacterAttributes.recalcCharacterStats !== 'function') return;
        if (!IE || typeof IE.getState !== 'function') return;
        window.CharacterAttributes.recalcCharacterStats({
            getEquipmentState: function () { return IE.getState().equipment; },
            getSkillsState: function () { return IE.getState().skills; },
            getItemTemplate: IE.getItemTemplate,
            getEnchantEntry: IE.getEnchantEntry,
            getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
        });
    }

    function ensureLifeCookingSkillEntry() {
        if (!IE || typeof IE.getState !== 'function') return false;
        var st = IE.getState();
        if (!st || typeof st !== 'object') return false;
        if (!st.skills || typeof st.skills !== 'object') st.skills = {};
        if (!st.skills.life_cooking || typeof st.skills.life_cooking !== 'object') {
            st.skills.life_cooking = { level: 1, move_usage: {} };
            recalcCharacterStatsFromIE();
            return true;
        }
        var changed = false;
        var lv = Math.max(0, parseInt(st.skills.life_cooking.level, 10) || 0);
        if (lv < 1) {
            st.skills.life_cooking.level = 1;
            changed = true;
        } else if (lv > COOKING_SKILL_MAX_LEVEL) {
            st.skills.life_cooking.level = COOKING_SKILL_MAX_LEVEL;
            changed = true;
        }
        if (!st.skills.life_cooking.move_usage || typeof st.skills.life_cooking.move_usage !== 'object') {
            st.skills.life_cooking.move_usage = {};
            changed = true;
        }
        var uses = Math.max(0, parseInt(st.skills.life_cooking.move_usage.cooking_success, 10) || 0);
        var mappedLv = getCookingLevelBySuccessUses(uses);
        if ((parseInt(st.skills.life_cooking.level, 10) || 0) !== mappedLv) {
            st.skills.life_cooking.level = mappedLv;
            changed = true;
        }
        if (changed) recalcCharacterStatsFromIE();
        return true;
    }

    function addCookingSuccessProficiency() {
        if (!IE || typeof IE.incrementSkillMoveUsage !== 'function' || typeof IE.getState !== 'function') return;
        if (!ensureLifeCookingSkillEntry()) return;
        var newUses = IE.incrementSkillMoveUsage('life_cooking', 'cooking_success', 1);
        var st = IE.getState();
        if (!st || !st.skills || !st.skills.life_cooking) return;
        var ent = st.skills.life_cooking;
        var nextLv = getCookingLevelBySuccessUses(newUses);
        var curLv = Math.max(1, parseInt(ent.level, 10) || 1);
        if (nextLv !== curLv) {
            ent.level = nextLv;
            recalcCharacterStatsFromIE();
        }
    }

    var DEFAULT_COOKING_INSTALLED_ACCESSORIES = [];

    function getCookingStationState() {
        if (!window.SceneCtx) {
            return {
                fuel_points: 0,
                water_points: 0,
                water_unlimited: false,
                installed_accessory_item_ids: DEFAULT_COOKING_INSTALLED_ACCESSORIES.slice()
            };
        }
        if (!window.SceneCtx.cooking_station_runtime || typeof window.SceneCtx.cooking_station_runtime !== 'object') {
            window.SceneCtx.cooking_station_runtime = {
                fuel_points: 0,
                water_points: 0,
                water_unlimited: false,
                installed_accessory_item_ids: DEFAULT_COOKING_INSTALLED_ACCESSORIES.slice(),
                active_craft: null
            };
        }
        var s = window.SceneCtx.cooking_station_runtime;
        if (!isFinite(parseInt(s.fuel_points, 10))) s.fuel_points = 0;
        if (!isFinite(parseInt(s.water_points, 10))) s.water_points = 0;
        s.water_unlimited = s.water_unlimited === true || s.water_unlimited === 'true' || s.water_unlimited === 1 || String(s.water_unlimited).toLowerCase() === '1';
        if (!Array.isArray(s.installed_accessory_item_ids)) s.installed_accessory_item_ids = DEFAULT_COOKING_INSTALLED_ACCESSORIES.slice();
        if (s.active_craft != null && typeof s.active_craft !== 'object') s.active_craft = null;
        return s;
    }

    // === Auto-generated Pharmacy Helper ===
    function getPharmacyStationState() {
        if (!window.SceneCtx) {
            return {
                fuel_points: 0,
                water_points: 0,
                water_unlimited: false,
                installed_accessory_item_ids: DEFAULT_PHARMACY_INSTALLED_ACCESSORIES.slice()
            };
        }
        if (!window.SceneCtx.pharmacy_station_runtime || typeof window.SceneCtx.pharmacy_station_runtime !== 'object') {
            window.SceneCtx.pharmacy_station_runtime = {
                fuel_points: 0,
                water_points: 0,
                water_unlimited: false,
                installed_accessory_item_ids: DEFAULT_PHARMACY_INSTALLED_ACCESSORIES.slice(),
                active_craft: null
            };
        }
        var s = window.SceneCtx.pharmacy_station_runtime;
        if (!isFinite(parseInt(s.fuel_points, 10))) s.fuel_points = 0;
        if (!isFinite(parseInt(s.water_points, 10))) s.water_points = 0;
        s.water_unlimited = s.water_unlimited === true || s.water_unlimited === 'true' || s.water_unlimited === 1 || String(s.water_unlimited).toLowerCase() === '1';
        if (!Array.isArray(s.installed_accessory_item_ids)) s.installed_accessory_item_ids = DEFAULT_PHARMACY_INSTALLED_ACCESSORIES.slice();
        if (s.active_craft != null && typeof s.active_craft !== 'object') s.active_craft = null;
        return s;
    }

    function getCookingAccessoryItemIdsFromMethods() {
        var out = [];
        var seen = {};
        if (!cookingMethods || typeof cookingMethods !== 'object') return out;
        var ids = Object.keys(cookingMethods);
        var i;
        for (i = 0; i < ids.length; i++) {
            var m = cookingMethods[ids[i]] || {};
            var aid = (m.requires_accessory_item_id != null) ? String(m.requires_accessory_item_id).trim() : '';
            if (!aid || seen[aid]) continue;
            seen[aid] = true;
            out.push(aid);
        }
        out.sort();
        return out;
    }

    function getCookingAccessoryOptionsFromInventory(installedIds) {
        var allow = getCookingAccessoryItemIdsFromMethods();
        if (!allow.length) return [];
        var installedSet = {};
        var i;
        for (i = 0; i < (installedIds || []).length; i++) installedSet[String(installedIds[i])] = true;
        var out = [];
        for (i = 0; i < allow.length; i++) {
            var id = allow[i];
            var have = getInventoryCountByItemId(id);
            if (have <= 0) continue;
            if (installedSet[id]) continue;
            out.push({ item_id: id, count: have });
        }
        return out;
    }

    // === Auto-generated Pharmacy Helper ===
    function getPharmacyAccessoryOptionsFromInventory(installedIds) {
        var allow = getPharmacyAccessoryItemIdsFromMethods();
        if (!allow.length) return [];
        var installedSet = {};
        var i;
        for (i = 0; i < (installedIds || []).length; i++) installedSet[String(installedIds[i])] = true;
        var out = [];
        for (i = 0; i < allow.length; i++) {
            var id = allow[i];
            var have = getInventoryCountByItemId(id);
            if (have <= 0) continue;
            if (installedSet[id]) continue;
            out.push({ item_id: id, count: have });
        }
        return out;
    }

    function installCookingAccessoryFromInventory(itemId) {
        var id = itemId != null ? String(itemId).trim() : '';
        if (!id) return { ok: false, reason: 'bad_item' };
        var allow = getCookingAccessoryItemIdsFromMethods();
        if (allow.indexOf(id) < 0) return { ok: false, reason: 'not_cooking_accessory', item_id: id };
        var cs = getCookingStationState();
        var arr = Array.isArray(cs.installed_accessory_item_ids) ? cs.installed_accessory_item_ids : [];
        var i;
        for (i = 0; i < arr.length; i++) {
            if (String(arr[i]) === id) return { ok: false, reason: 'already_installed', item_id: id };
        }
        var slot = findFirstContainerSlotByItemId(id);
        if (!slot) return { ok: false, reason: 'missing_item', item_id: id };
        if (!IE || typeof IE.takeItemFromContainer !== 'function') return { ok: false, reason: 'inventory_api_missing' };
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        if (!taken || !taken.success || !taken.item) return { ok: false, reason: 'take_failed', item_id: id };
        arr.push(id);
        cs.installed_accessory_item_ids = arr;
        return { ok: true, item_id: id };
    }

    // === Auto-generated Pharmacy Helper ===
    function installPharmacyAccessoryFromInventory(itemId) {
        var id = itemId != null ? String(itemId).trim() : '';
        if (!id) return { ok: false, reason: 'bad_item' };
        var allow = getPharmacyAccessoryItemIdsFromMethods();
        if (allow.indexOf(id) < 0) return { ok: false, reason: 'not_pharmacy_accessory', item_id: id };
        var cs = getPharmacyStationState();
        var arr = Array.isArray(cs.installed_accessory_item_ids) ? cs.installed_accessory_item_ids : [];
        var i;
        for (i = 0; i < arr.length; i++) {
            if (String(arr[i]) === id) return { ok: false, reason: 'already_installed', item_id: id };
        }
        var slot = findFirstContainerSlotByItemId(id);
        if (!slot) return { ok: false, reason: 'missing_item', item_id: id };
        if (!IE || typeof IE.takeItemFromContainer !== 'function') return { ok: false, reason: 'inventory_api_missing' };
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        if (!taken || !taken.success || !taken.item) return { ok: false, reason: 'take_failed', item_id: id };
        arr.push(id);
        cs.installed_accessory_item_ids = arr;
        return { ok: true, item_id: id };
    }

    function uninstallCookingAccessoryToInventory(itemId) {
        var id = itemId != null ? String(itemId).trim() : '';
        if (!id) return { ok: false, reason: 'bad_item' };
        var cs = getCookingStationState();
        var src = Array.isArray(cs.installed_accessory_item_ids) ? cs.installed_accessory_item_ids : [];
        var out = [];
        var removed = false;
        var i;
        for (i = 0; i < src.length; i++) {
            var cur = String(src[i]).trim();
            if (!removed && cur === id) {
                removed = true;
                continue;
            }
            if (cur) out.push(cur);
        }
        if (!removed) return { ok: false, reason: 'not_installed', item_id: id };
        if (!IE || typeof IE.putItemIntoDefaultContainer !== 'function') return { ok: false, reason: 'inventory_api_missing' };
        var inst = { item_id: id, count: 1, quality_tier: 0 };
        var placed = IE.putItemIntoDefaultContainer(inst);
        if (!placed || !placed.placed) {
            var st = E && typeof E.getState === 'function' ? E.getState() : null;
            if (st && typeof IE.addItemToGround === 'function') {
                IE.addItemToGround(st.mapId, st.x, st.y, inst);
            } else {
                return { ok: false, reason: 'put_back_failed', item_id: id };
            }
        }
        cs.installed_accessory_item_ids = out;
        return { ok: true, item_id: id };
    }

    // === Auto-generated Pharmacy Helper ===
    function uninstallPharmacyAccessoryToInventory(itemId) {
        var id = itemId != null ? String(itemId).trim() : '';
        if (!id) return { ok: false, reason: 'bad_item' };
        var cs = getPharmacyStationState();
        var src = Array.isArray(cs.installed_accessory_item_ids) ? cs.installed_accessory_item_ids : [];
        var out = [];
        var removed = false;
        var i;
        for (i = 0; i < src.length; i++) {
            var cur = String(src[i]).trim();
            if (!removed && cur === id) {
                removed = true;
                continue;
            }
            if (cur) out.push(cur);
        }
        if (!removed) return { ok: false, reason: 'not_installed', item_id: id };
        if (!IE || typeof IE.putItemIntoDefaultContainer !== 'function') return { ok: false, reason: 'inventory_api_missing' };
        var inst = { item_id: id, count: 1, quality_tier: 0 };
        var placed = IE.putItemIntoDefaultContainer(inst);
        if (!placed || !placed.placed) {
            var st = E && typeof E.getState === 'function' ? E.getState() : null;
            if (st && typeof IE.addItemToGround === 'function') {
                IE.addItemToGround(st.mapId, st.x, st.y, inst);
            } else {
                return { ok: false, reason: 'put_back_failed', item_id: id };
            }
        }
        cs.installed_accessory_item_ids = out;
        return { ok: true, item_id: id };
    }

    function isCookingMethodUnlockedAtStation(methodId, stationContext) {
        var m = cookingMethods && methodId ? cookingMethods[String(methodId)] : null;
        if (!m) return false;
        var ctx = stationContext || getCurrentCookingStationContext();
        if (ctx && ctx.station_type === 'temp') {
            var allowed = ctx.temp_station && Array.isArray(ctx.temp_station.allowed_methods) ? ctx.temp_station.allowed_methods : null;
            if (allowed && allowed.length) {
                var mid0 = String(methodId);
                var allowHit = false;
                var ai;
                for (ai = 0; ai < allowed.length; ai++) {
                    if (String(allowed[ai]) === mid0) { allowHit = true; break; }
                }
                if (!allowHit) return false;
            }
        }
        var req = m.requires_accessory_item_id;
        if (req == null || String(req).trim() === '') return true;
        var arr;
        if (ctx && ctx.station_type === 'temp') {
            arr = ctx.temp_station && Array.isArray(ctx.temp_station.installed_accessory_item_ids)
                ? ctx.temp_station.installed_accessory_item_ids
                : [];
        } else {
            var st = getCookingStationState();
            arr = st.installed_accessory_item_ids || [];
        }
        var need = String(req).trim();
        var i;
        for (i = 0; i < arr.length; i++) {
            if (String(arr[i]).trim() === need) return true;
        }
        return false;
    }

    // === Auto-generated Pharmacy Helper ===
    function isPharmacyMethodUnlockedAtStation(methodId, stationContext) {
        var m = pharmacyMethods && methodId ? pharmacyMethods[String(methodId)] : null;
        if (!m) return false;
        var ctx = stationContext || getCurrentPharmacyStationContext();
        if (ctx && ctx.station_type === 'temp') {
            var allowed = ctx.temp_station && Array.isArray(ctx.temp_station.allowed_methods) ? ctx.temp_station.allowed_methods : null;
            if (allowed && allowed.length) {
                var mid0 = String(methodId);
                var allowHit = false;
                var ai;
                for (ai = 0; ai < allowed.length; ai++) {
                    if (String(allowed[ai]) === mid0) { allowHit = true; break; }
                }
                if (!allowHit) return false;
            }
        }
        var req = m.requires_accessory_item_id;
        if (req == null || String(req).trim() === '') return true;
        var arr;
        if (ctx && ctx.station_type === 'temp') {
            arr = ctx.temp_station && Array.isArray(ctx.temp_station.installed_accessory_item_ids)
                ? ctx.temp_station.installed_accessory_item_ids
                : [];
        } else {
            var st = getPharmacyStationState();
            arr = st.installed_accessory_item_ids || [];
        }
        var need = String(req).trim();
        var i;
        for (i = 0; i < arr.length; i++) {
            if (String(arr[i]).trim() === need) return true;
        }
        return false;
    }

    function markCookingRecipeKnown(recipeId) {
        if (!recipeId || !window.SceneCtx) return;
        window.SceneCtx.known_cooking_recipes = window.SceneCtx.known_cooking_recipes || {};
        var rid = String(recipeId);
        window.SceneCtx.known_cooking_recipes[rid] = true;
        window.SceneCtx.known_recipe_ids_by_system = window.SceneCtx.known_recipe_ids_by_system || {};
        if (!window.SceneCtx.known_recipe_ids_by_system[COOKING_RECIPE_SYSTEM]) {
            window.SceneCtx.known_recipe_ids_by_system[COOKING_RECIPE_SYSTEM] = {};
        }
        window.SceneCtx.known_recipe_ids_by_system[COOKING_RECIPE_SYSTEM][rid] = true;
    }

    function resetCookingStateForNewCharacter() {
        if (!window.SceneCtx) return;
        window.SceneCtx.cooking_station_runtime = {
            fuel_points: 0,
            water_points: 0,
            water_unlimited: false,
            installed_accessory_item_ids: DEFAULT_COOKING_INSTALLED_ACCESSORIES.slice(),
            active_craft: null
        };
        window.SceneCtx.cooking_temp_stations_runtime = [];
        syncCookingTempStationsIntoMaps();
        window.SceneCtx.known_cooking_recipes = {};
        window.SceneCtx.known_recipe_ids_by_system = {};
        stopCookingCraftIdle();
        if (window.NPCSystem && typeof window.NPCSystem.resetCookingStationRepairQuestFlags === 'function') {
            try { window.NPCSystem.resetCookingStationRepairQuestFlags(); } catch (eNq) { /* ignore */ }
        }
        stopPharmacyCraftIdle();
        window.SceneCtx.pharmacy_station_runtime = {
            fuel_points: 0,
            water_points: 0,
            water_unlimited: false,
            installed_accessory_item_ids: DEFAULT_PHARMACY_INSTALLED_ACCESSORIES.slice(),
            active_craft: null
        };
        window.SceneCtx.known_pharmacy_recipes = {};
        if (window.NPCSystem && typeof window.NPCSystem.resetPharmacyStationRepairQuestFlags === 'function') {
            try { window.NPCSystem.resetPharmacyStationRepairQuestFlags(); } catch (ePq) { /* ignore */ }
        }
    }

    function isOnCookingStationTile() {
        return !!getCurrentCookingStationContext();
    }

    function isOnPharmacyStationTile() {
        return !!getCurrentPharmacyStationContext();
    }

    function isOnCompostStationTile() {
        return !!getCurrentCompostStationContext();
    }

    function isOnBedStationTile() {
        return !!getCurrentBedStationContext();
    }

    function canPourWaterAtCurrentTile() {
        if (isPreCreationGameplayRestricted()) return false;
        if (!isOnCookingStationTile()) return false;
        if (isCookingUiBlockedByRepair()) return false;
        var pourCtx = getCurrentCookingStationContext();
        if (pourCtx && pourCtx.station_type === 'main' && getCookingStationState().water_unlimited) return false;
        var slot = findFirstContainerSlotByPredicate(function (cell) {
            return getItemWaterPoints(cell.item_id) > 0;
        });
        return !!slot;
    }
    function canAddFuelAtCurrentTile() {
        if (isPreCreationGameplayRestricted()) return false;
        if (!isOnCookingStationTile()) return false;
        if (isCookingUiBlockedByRepair()) return false;
        var slot = findFirstContainerSlotByPredicate(function (cell) {
            return getItemFuelPoints(cell.item_id) > 0;
        });
        return !!slot;
    }

    function isFishingPointAtPlayerTile() {
        if (!E || !G || typeof E.getState !== 'function') return false;
        var st = E.getState();
        var rec = (E.getEntityRecordAt && typeof E.getEntityRecordAt === 'function') ? E.getEntityRecordAt(st.x, st.y) : null;
        var entityId = rec ? (rec.entity_id || null) : (E.getEntityAt ? E.getEntityAt(st.x, st.y) : null);
        if (!entityId) return false;
        var cfg = (typeof G.getGatheringPointConfig === 'function') ? G.getGatheringPointConfig(entityId) : null;
        var cat = cfg && cfg.wild_interaction_category != null ? String(cfg.wild_interaction_category) : '';
        if (cat === 'fishing') return true;
        // 兼容旧数据：未配 category 时允许 fishing 命名实体
        return String(entityId).indexOf('fishing') >= 0;
    }

    function canTakeWaterAtCurrentTile() {
        if (isPreCreationGameplayRestricted()) return false;
        if (!isFishingPointAtPlayerTile()) return false;
        return hasItemById('tool_bucket_water_empty');
    }

    function onTakeWaterClick() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (!isFishingPointAtPlayerTile()) {
            showMsg(ui('cooking.take_water.not_fishing'), 'info');
            return;
        }
        if (gatheringIdleTimer) {
            showMsg(ui('cooking.take_water.stop_gather_first'), 'info');
            return;
        }
        var slot = findFirstContainerSlotByItemId('tool_bucket_water_empty');
        if (!slot) {
            showMsg(ui('cooking.take_water.no_bucket'), 'info');
            return;
        }
        if (!IE || typeof IE.takeItemFromContainer !== 'function' || typeof IE.putItemIntoDefaultContainer !== 'function') return;
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        if (!taken || !taken.success || !taken.item) {
            showMsg(ui('cooking.take_water.fail_consume'), 'warn');
            return;
        }
        var placed = IE.putItemIntoDefaultContainer({ item_id: 'tool_bucket_water_full', count: 1, quality_tier: 0 });
        if (!placed || !placed.placed) {
            // 背包塞不下时回滚空桶，避免道具吞没
            IE.putItemIntoDefaultContainer(taken.item);
            showMsg(ui('cooking.take_water.fail_full'), 'warn');
            return;
        }
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        var st = E.getState();
        markCellDirty(st.mapId, st.x, st.y);
        showMsg(ui('cooking.take_water.ok'), 'success');
        if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    function onPourWaterClick(forcedSlot) {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (!isOnCookingStationTile()) {
            showMsg(ui('cooking.station.not_on_tile'), 'info');
            return;
        }
        if (isCookingUiBlockedByRepair()) {
            showMsg(ui('cooking.station.locked_until_repaired'), 'info');
            return;
        }
        var pourCtx0 = getCurrentCookingStationContext();
        if (pourCtx0 && pourCtx0.station_type === 'main' && getCookingStationState().water_unlimited) {
            showMsg(ui('cooking.pour_water.main_already_unlimited'), 'info');
            return;
        }
        var slot = resolveCookingSlotOrFirst(forcedSlot, function (cell) {
            return getItemWaterPoints(cell.item_id) > 0;
        });
        if (!slot) {
            showMsg(ui(forcedSlot ? 'cooking.pour_water.slot_invalid' : 'cooking.pour_water.no_item'), 'info');
            return;
        }
        var waterGain = getItemWaterPoints(slot.item.item_id);
        if (!(waterGain > 0)) {
            showMsg(ui('cooking.pour_water.no_water_value'), 'info');
            return;
        }
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        if (!taken || !taken.success || !taken.item) {
            showMsg(ui('cooking.pour_water.fail_take'), 'warn');
            return;
        }
        var cs = getCookingStationState();
        var before = parseInt(cs.water_points, 10) || 0;
        var afterRaw = before + waterGain;
        var after = Math.min(COOKING_WATER_MAX_POINTS, afterRaw);
        var overflow = Math.max(0, afterRaw - after);
        cs.water_points = after;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        showMsg(
            overflow > 0
                ? ui('cooking.pour_water.ok_overflow', { gain: waterGain, before: before, after: after, max: COOKING_WATER_MAX_POINTS, overflow: overflow })
                : ui('cooking.pour_water.ok', { gain: waterGain, before: before, after: after, max: COOKING_WATER_MAX_POINTS }),
            'success'
        );
        if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (window.SceneRenderer) window.SceneRenderer.render();
    }
    function onAddFuelClick(forcedSlot) {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (!isOnCookingStationTile()) {
            showMsg(ui('cooking.station.not_on_tile'), 'info');
            return;
        }
        if (isCookingUiBlockedByRepair()) {
            showMsg(ui('cooking.station.locked_until_repaired'), 'info');
            return;
        }
        var slot = resolveCookingSlotOrFirst(forcedSlot, function (cell) {
            return getItemFuelPoints(cell.item_id) > 0;
        });
        if (!slot) {
            showMsg(ui(forcedSlot ? 'cooking.add_fuel.slot_invalid' : 'cooking.add_fuel.no_item'), 'info');
            return;
        }
        var fuelGain = getItemFuelPoints(slot.item.item_id);
        if (!(fuelGain > 0)) {
            showMsg(ui('cooking.add_fuel.not_fuel'), 'info');
            return;
        }
        var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
        if (!taken || !taken.success || !taken.item) {
            showMsg(ui('cooking.add_fuel.fail_take'), 'warn');
            return;
        }
        var cs = getCookingStationState();
        var before = parseInt(cs.fuel_points, 10) || 0;
        var afterRaw = before + fuelGain;
        var after = Math.min(COOKING_FUEL_MAX_POINTS, afterRaw);
        var overflow = Math.max(0, afterRaw - after);
        cs.fuel_points = after;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        showMsg(
            overflow > 0
                ? ui('cooking.add_fuel.ok_overflow', { gain: fuelGain, before: before, after: after, max: COOKING_FUEL_MAX_POINTS, overflow: overflow })
                : ui('cooking.add_fuel.ok', { gain: fuelGain, before: before, after: after, max: COOKING_FUEL_MAX_POINTS }),
            'success'
        );
        if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (window.SceneRenderer) window.SceneRenderer.render();
    }

    /**
     * 烹饪台：**必须**指定当前灶台工艺 `methodId`。燃料/水/world tick/体力一律来自 `cooking-methods.json`（与配方无关）。
     * 在该工艺下按投料 multiset 命中配方；**无命中亦扣料 + 扣技法资源** → 全局失败物（id 见 cooking-system-config.csv）；多命中加权选配方后再判成功率。
     */
    function tryCookAtStation(methodId, inputItems) {
        if (guardPlayerActionBlocked(ACTION_TYPES.CRAFT)) {
            return { ok: false, reason: 'action_disabled', action_type: ACTION_TYPES.CRAFT };
        }
        var stationCtx = getCurrentCookingStationContext();
        if (!stationCtx) return { ok: false, reason: 'not_on_cooking_station' };
        if (isCookingUiBlockedByRepairForContext(stationCtx)) {
            return { ok: false, reason: 'cooking_station_repair_locked' };
        }
        if (methodId == null || !Array.isArray(inputItems)) return { ok: false, reason: 'bad_args' };
        if (getActiveCookingCraft()) return { ok: false, reason: 'craft_in_progress' };
        var mid = String(methodId).trim();
        if (!mid) return { ok: false, reason: 'method_required' };
        var m = cookingMethods && cookingMethods[mid] ? cookingMethods[mid] : null;
        if (!m) return { ok: false, reason: 'method_not_found', method_id: mid };
        if (!isCookingMethodUnlockedAtStation(mid, stationCtx)) {
            return {
                ok: false,
                reason: 'cooking_method_locked',
                method_id: mid,
                required_accessory_item_id: m.requires_accessory_item_id != null ? m.requires_accessory_item_id : null
            };
        }

        var selected = normalizeCookingInputs(inputItems);
        if (!selected.length) return { ok: false, reason: 'empty_inputs' };
        var i;
        for (i = 0; i < selected.length; i++) {
            var sid = selected[i].item_id;
            if (!isItemAllowedCookingIngredient(sid)) {
                return { ok: false, reason: 'not_cooking_ingredient', item_id: sid };
            }
            if (getInventoryCountByItemId(sid) < selected[i].count) {
                return { ok: false, reason: 'missing_input_items', item_id: sid };
            }
        }

        var matched = matchCookingRecipesByInputs(selected, mid);

        var needFuel = Math.max(0, parseInt(m.fuel_cost, 10) || 0);
        var needWater = Math.max(0, parseInt(m.water_cost, 10) || 0);
        var needTicks = Math.max(0, parseInt(m.craft_ticks, 10) || 0);
        var needStamina = Math.max(0, parseInt(m.stamina_cost, 10) || 0);
        var cs = getCookingStationState();
        var curFuel = parseInt(cs.fuel_points, 10) || 0;
        var curWater = parseInt(cs.water_points, 10) || 0;
        var mainWaterFree = !!(stationCtx && stationCtx.station_type === 'main' && cs.water_unlimited);
        if (curFuel < needFuel) return { ok: false, reason: 'insufficient_fuel', need: needFuel, current: curFuel };
        if (!mainWaterFree && curWater < needWater) return { ok: false, reason: 'insufficient_water', need: needWater, current: curWater };
        var survState = window.Survival && typeof window.Survival.getState === 'function' ? window.Survival.getState() : null;
        var curStamina = survState ? Number(survState.stamina || 0) : 0;
        if (curStamina < needStamina) return { ok: false, reason: 'insufficient_stamina', need: needStamina, current: curStamina };
        if (IE && typeof IE.canAcceptItem === 'function' && !IE.canAcceptItem()) {
            return { ok: false, reason: 'inventory_full' };
        }

        var consumedRes = consumeInventoryItemsByList(selected);
        if (!consumedRes.ok) {
            putItemsBack(consumedRes.consumed || []);
            return { ok: false, reason: 'consume_inputs_failed' };
        }

        cs.fuel_points = curFuel - needFuel;
        if (!mainWaterFree) cs.water_points = curWater - needWater;
        if (window.Survival && typeof window.Survival.consumeStamina === 'function' && needStamina > 0) {
            window.Survival.consumeStamina(needStamina);
        }

        // 固定 tick 耗时：开做即扣资源，但时间按 world tick 递减；制作中不可移动
        var cs2 = getCookingStationState();
        var gt = window.GameTime && typeof window.GameTime.getState === 'function' ? window.GameTime.getState() : null;
        cs2.active_craft = {
            remaining_ticks: Math.max(1, needTicks),
            started_total_ticks: gt && typeof gt.totalTicks === 'number' ? gt.totalTicks : 0,
            method_id: mid,
            inputs: selected,
            consumed_items: consumedRes.consumed || [],
            station_ref: {
                station_type: stationCtx.station_type || 'main',
                map_id: stationCtx.map_id,
                x: stationCtx.x,
                y: stationCtx.y
            }
        };
        stopGatheringIdle();
        patchSurvivalTickForCookingCraftOnce();
        startCookingCraftIdleIfNeeded();
        showMsg(ui('cooking.msg.started', { n: Math.max(1, needTicks) }), 'info');
        if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (window.SceneRenderer) window.SceneRenderer.render();
        return {
            ok: true,
            started: true,
            method_id: mid,
            remaining_ticks: Math.max(1, needTicks),
            consumed: { fuel: needFuel, water: needWater, ticks: needTicks, stamina: needStamina }
        };
    }

    var backpackPanelOpen = false;
    var backpackUIState = {
        container: 'backpack',
        selectedContainer: 'backpack',
        selectedIndex: -1,
        search: ''
    };

    function updateBackpackPanel() {
        if (!IE) return;
        var char = IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        var st = E.getState();
        var groundPos = { mapId: st.mapId, x: st.x, y: st.y };
        var ieState = IE.getState ? IE.getState() : {};
        var hasVehicle = !!ieState.bound_vehicle_id;

        function escHtml(v) {
            return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function getContainerLabel(containerType) {
            if (containerType === 'pocket') return ui('inv.pocket');
            if (containerType === 'vest') return ui('inv.vest');
            if (containerType === 'backpack') return ui('inv.backpack');
            if (containerType === 'vehicle') return ui('inv.vehicle');
            if (containerType === 'ground') return ui('inv.ground');
            return containerType;
        }

        function getContainerRows(containerType) {
            var rows = [];
            if (containerType === 'pocket') {
                var p = IE.getPocketArray ? IE.getPocketArray() : [];
                for (var i = 0; i < p.length; i++) {
                    if (!p[i] || !p[i].item_id) continue;
                    rows.push({ source: 'pocket', index: i, item: p[i] });
                }
            } else if (containerType === 'vest') {
                var v = IE.getVestArray ? IE.getVestArray() : [];
                for (var j = 0; j < v.length; j++) {
                    if (!v[j] || !v[j].item_id) continue;
                    rows.push({ source: 'vest', index: j, item: v[j] });
                }
            } else if (containerType === 'backpack') {
                var b = IE.getBackpackArray ? IE.getBackpackArray() : [];
                for (var k = 0; k < b.length; k++) {
                    if (!b[k] || !b[k].item_id) continue;
                    rows.push({ source: 'backpack', index: k, item: b[k] });
                }
            } else if (containerType === 'vehicle') {
                if (!hasVehicle) return [];
                var va = Array.isArray(ieState.inventory_vehicle) ? ieState.inventory_vehicle : [];
                for (var q = 0; q < va.length; q++) {
                    if (!va[q] || !va[q].item_id) continue;
                    rows.push({ source: 'vehicle', index: q, item: va[q] });
                }
            } else if (containerType === 'ground') {
                var g = IE.getGroundItemsAt ? IE.getGroundItemsAt(st.mapId, st.x, st.y) : [];
                for (var m = 0; m < g.length; m++) {
                    if (!g[m] || !g[m].item_id) continue;
                    rows.push({ source: 'ground', index: m, item: g[m] });
                }
            }
            return rows;
        }

        function resolveRowDisplay(row) {
            var it = row && row.item;
            var tpl = it && it.item_id ? IE.getItemTemplate(it.item_id) : null;
            var tier = it && it.item_id && IE.getItemDisplayTier ? IE.getItemDisplayTier(it.item_id, char) : 0;
            var name = tpl ? IE.getDisplayName(tpl, tier, char) : (it ? it.item_id : ui('common.dash'));
            var desc = tpl ? IE.getDisplayDesc(tpl, tier, char) : '';
            var qty = (it && it.count != null && it.count > 1) ? (' x' + it.count) : '';
            return { tpl: tpl, name: name, desc: desc, qty: qty };
        }

        function pickRowFromState(rows) {
            if (!Array.isArray(rows) || !rows.length) return null;
            if (backpackUIState.selectedContainer === backpackUIState.container) {
                for (var i = 0; i < rows.length; i++) {
                    if (rows[i].index === backpackUIState.selectedIndex) return rows[i];
                }
            }
            backpackUIState.selectedContainer = backpackUIState.container;
            backpackUIState.selectedIndex = rows[0].index;
            return rows[0];
        }

        function doEquipFromContainer(containerType, idx, tpl) {
            if (!tpl || !tpl.equip_slot || !IE || typeof IE.takeItemFromContainer !== 'function') return;
            var posNow = E.getState ? E.getState() : groundPos;
            var taken = IE.takeItemFromContainer(containerType, idx);
            if (!taken.success || !taken.item) return;
            var itemToEquip = taken.item;
            if (itemToEquip && itemToEquip.count != null) itemToEquip.count = 1;
            var stNow = IE.getState ? IE.getState() : {};
            var currentEq = (stNow && stNow.equipment) ? stNow.equipment[tpl.equip_slot] : null;
            if (currentEq) {
                var unequipped = IE.unequip(tpl.equip_slot, posNow);
                if (unequipped) {
                    var placedOld = IE.putItemIntoDefaultContainer(unequipped);
                    if (!placedOld || !placedOld.placed) IE.addItemToGround(posNow.mapId, posNow.x, posNow.y, unequipped);
                }
            }
            var res = IE.equip(tpl.equip_slot, itemToEquip);
            if (!res || !res.success) {
                var placedNew = IE.putItemIntoDefaultContainer(itemToEquip);
                if (!placedNew || !placedNew.placed) IE.addItemToGround(posNow.mapId, posNow.x, posNow.y, itemToEquip);
                showMsg((res && res.message) ? res.message : ui('inv.equip'), 'warn');
            } else {
                showMsg(ui('log.success.equipped'), 'success');
            }
            markCellDirty(posNow.mapId, posNow.x, posNow.y);
            updateBackpackPanel();
            render();
        }

        function renderItemList() {
            var listEl = document.getElementById('backpack-item-list');
            var titleEl = document.getElementById('backpack-list-title');
            if (!listEl || !titleEl) return { rows: [], picked: null };
            titleEl.textContent = getContainerLabel(backpackUIState.container);
            var rows = getContainerRows(backpackUIState.container);
            var q = String(backpackUIState.search || '').trim().toLowerCase();
            if (q) {
                rows = rows.filter(function (row) {
                    var d = resolveRowDisplay(row);
                    var hay = (d.name + ' ' + (row.item && row.item.item_id ? row.item.item_id : '') + ' ' + (d.desc || '')).toLowerCase();
                    return hay.indexOf(q) >= 0;
                });
            }
            listEl.innerHTML = '';
            if (!rows.length) {
                listEl.innerHTML = '<div class="bp-detail-empty">当前容器没有可显示物品。</div>';
                return { rows: rows, picked: null };
            }
            var picked = pickRowFromState(rows);
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var disp = resolveRowDisplay(row);
                var node = document.createElement('div');
                var selected = picked && picked.index === row.index && picked.source === row.source;
                node.className = 'bp-item-row' + (selected ? ' selected' : '');
                node.innerHTML =
                    '<div class="bp-item-tier"></div>' +
                    '<div class="bp-item-main">' +
                    '<div class="bp-item-name">' + escHtml(disp.name + disp.qty) + '</div>' +
                    '<div class="bp-item-sub">' + escHtml(disp.desc || '') + '</div>' +
                    '<div class="bp-item-meta">' + escHtml(row.item.item_id || '') + '</div>' +
                    '</div>';
                var tipHtml = buildItemTooltipHtmlForTemplate(row.item.item_id, disp.tpl, row.item, char);
                node.addEventListener('mouseenter', function (h, el) { return function () { showItemTooltip(h, el); }; }(tipHtml, node));
                node.addEventListener('mouseleave', hideItemTooltip);
                node.onclick = (function (r) {
                    return function () {
                        backpackUIState.selectedContainer = backpackUIState.container;
                        backpackUIState.selectedIndex = r.index;
                        updateBackpackPanel();
                    };
                })(row);
                listEl.appendChild(node);
            }
            return { rows: rows, picked: picked };
        }

        function renderDetail(picked) {
            var detailEl = document.getElementById('backpack-detail');
            if (!detailEl) return;
            detailEl.innerHTML = '';
            if (!picked || !picked.item || !picked.item.item_id) {
                detailEl.innerHTML = '<div class="bp-detail-empty">尚未选中物品。</div>';
                return;
            }
            var disp = resolveRowDisplay(picked);
            var title = document.createElement('div');
            title.className = 'bp-detail-title';
            title.textContent = disp.name + disp.qty;
            detailEl.appendChild(title);
            var desc = document.createElement('div');
            desc.className = 'bp-detail-desc';
            desc.textContent = disp.desc || '';
            detailEl.appendChild(desc);
            var modulesHtml = '';
            try {
                if (window.ItemInfoModules && typeof window.ItemInfoModules.renderTooltipModulesHtml === 'function') {
                    modulesHtml = window.ItemInfoModules.renderTooltipModulesHtml({
                        itemId: picked.item.item_id,
                        tpl: disp.tpl,
                        character: char
                    }) || '';
                }
            } catch (eMod) { modulesHtml = ''; }
            if (modulesHtml) {
                var modWrap = document.createElement('div');
                modWrap.className = 'bp-detail-modules';
                modWrap.innerHTML = modulesHtml;
                detailEl.appendChild(modWrap);
            }
            var fieldAppend = buildItemFieldRulesHtmlAppend(picked.item.item_id, disp.tpl, picked.item, char);
            if (fieldAppend) {
                var fieldWrap = document.createElement('div');
                fieldWrap.className = 'bp-detail-field-rules';
                fieldWrap.innerHTML = fieldAppend;
                detailEl.appendChild(fieldWrap);
            }

            var actions = document.createElement('div');
            actions.className = 'bp-detail-actions';
            function addActionBtn(label, onClick) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'bp-action-btn';
                btn.textContent = label;
                btn.onclick = onClick;
                actions.appendChild(btn);
            }
            if (picked.source !== 'ground') {
                if (itemTemplateIsConsumable(disp.tpl)) {
                    addActionBtn(ui('inv.use'), function () { tryUseItemFromContainer(picked.source, picked.index); });
                }
                if (disp.tpl && disp.tpl.equip_slot) {
                    addActionBtn(ui('inv.equip'), function () { doEquipFromContainer(picked.source, picked.index, disp.tpl); });
                }
                addActionBtn(ui('inv.drop'), function () {
                    var pos = E.getState();
                    var r = IE.dropItemToGround(picked.source, picked.index, pos.mapId, pos.x, pos.y);
                    if (r.success) showMsg(ui('log.info.dropped'), 'info');
                    else if (r.message) showMsg(r.message, 'warn');
                    markCellDirty(pos.mapId, pos.x, pos.y);
                    updateBackpackPanel();
                    render();
                });
            } else {
                addActionBtn(ui('inv.pickup'), function () {
                    var r0 = IE.pickUpFromGround(st.mapId, st.x, st.y, picked.index);
                    if (r0.success) showMsg(ui('log.success.picked'), 'success');
                    else if (r0.message) showMsg(r0.message, 'warn');
                    markCellDirty(st.mapId, st.x, st.y);
                    updateBackpackPanel();
                    render();
                });
                if (disp.tpl && disp.tpl.equip_slot) {
                    addActionBtn(ui('inv.equip'), function () {
                        var r1 = IE.equipFromGround(st.mapId, st.x, st.y, picked.index);
                        if (r1.success) showMsg(ui('log.success.equipped'), 'success');
                        else if (r1.message) showMsg(r1.message, 'warn');
                        markCellDirty(st.mapId, st.x, st.y);
                        updateBackpackPanel();
                        render();
                    });
                }
            }
            detailEl.appendChild(actions);
        }

        function renderEquipList() {
            var equipList = document.getElementById('equip-list');
            if (!equipList || !IE.EQUIP_SLOT_IDS) return;
            equipList.innerHTML = '';
            var eqState = ieState.equipment || {};
            for (var s = 0; s < IE.EQUIP_SLOT_IDS.length; s++) {
                var slotId = IE.EQUIP_SLOT_IDS[s];
                var row = document.createElement('div');
                row.className = 'equip-row';
                var labelKey = EQUIP_SLOT_LABELS[slotId] || slotId;
                var label = (labelKey && String(labelKey).indexOf('equip.slot.') === 0) ? ui(labelKey) : labelKey;
                var eq = eqState[slotId];
                var itemName = ui('common.dash');
                if (eq && eq.item_id) {
                    var eqTpl = IE.getItemTemplate(eq.item_id);
                    var eqTier = IE.getItemDisplayTier ? IE.getItemDisplayTier(eq.item_id, char) : 0;
                    itemName = eqTpl ? IE.getDisplayName(eqTpl, eqTier, char) : eq.item_id;
                }
                row.innerHTML = '<span class="slot-name">' + escHtml(label) + '</span><span class="item-name">' + escHtml(itemName) + '</span>';
                var unequipBtn = document.createElement('button');
                unequipBtn.type = 'button';
                unequipBtn.className = 'btn-unequip';
                unequipBtn.textContent = ui('inv.unequip');
                unequipBtn.disabled = !eq || !eq.item_id;
                unequipBtn.onclick = (function (sid) {
                    return function () {
                        var old = IE.unequip(sid, groundPos);
                        if (old) {
                            var placed = IE.putItemIntoDefaultContainer(old);
                            if (!placed.placed) IE.addItemToGround(groundPos.mapId, groundPos.x, groundPos.y, old);
                            showMsg(ui('log.info.unequipped'), 'info');
                            markCellDirty(groundPos.mapId, groundPos.x, groundPos.y);
                        }
                        updateBackpackPanel();
                        render();
                    };
                })(slotId);
                row.appendChild(unequipBtn);
                equipList.appendChild(row);
            }
        }

        var carryEl = document.getElementById('backpack-carry');
        if (carryEl) {
            var capBp = (window.CharacterAttributes && typeof window.CharacterAttributes.getCarryCapacity === 'function')
                ? window.CharacterAttributes.getCarryCapacity() : null;
            var curBp = (IE && typeof IE.getCurrentCarryWeight === 'function') ? IE.getCurrentCarryWeight() : null;
            var labBp = ui('status.label.carry');
            if (capBp != null && curBp != null)
                carryEl.textContent = labBp + ' ' + curBp.toFixed(1) + ' / ' + capBp.toFixed(1) + ' kg';
            else if (capBp != null)
                carryEl.textContent = labBp + ' — / ' + capBp.toFixed(1) + ' kg';
            else
                carryEl.textContent = labBp + ' —';
        }

        var tabWrap = document.getElementById('backpack-tabs');
        if (tabWrap) {
            var tabBtns = tabWrap.querySelectorAll('.bp-tab-btn');
            for (var tb = 0; tb < tabBtns.length; tb++) {
                var tbtn = tabBtns[tb];
                var key = tbtn.getAttribute('data-container') || '';
                var disabled = (key === 'vehicle' && !hasVehicle);
                tbtn.style.display = (key === 'vehicle' && !hasVehicle) ? 'none' : '';
                tbtn.classList.toggle('active', backpackUIState.container === key);
                tbtn.onclick = (function (nextKey) {
                    return function () {
                        if (nextKey === 'vehicle' && !hasVehicle) return;
                        backpackUIState.container = nextKey;
                        backpackUIState.selectedContainer = nextKey;
                        backpackUIState.selectedIndex = -1;
                        updateBackpackPanel();
                    };
                })(key);
                tbtn.disabled = !!disabled;
            }
        }

        var searchInput = document.getElementById('backpack-search');
        if (searchInput) {
            if (searchInput.value !== backpackUIState.search) searchInput.value = backpackUIState.search;
            if (!searchInput._bpBound) {
                searchInput._bpBound = true;
                searchInput.addEventListener('input', function () {
                    backpackUIState.search = String(searchInput.value || '');
                    backpackUIState.selectedIndex = -1;
                    updateBackpackPanel();
                });
            }
        }

        var listState = renderItemList();
        renderDetail(listState.picked);
        renderEquipList();
    }

    function openBackpackPanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (backpackPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        backpackPanelOpen = true;
        document.getElementById('modal-backpack').classList.add('show');
        updateBackpackPanel();
        render();
    }
    function closeBackpackPanel() {
        if (!backpackPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        backpackPanelOpen = false;
        document.getElementById('modal-backpack').classList.remove('show');
        render();
    }
    if (document.getElementById('btn-backpack')) {
        document.getElementById('btn-backpack').addEventListener('click', function () {
            if (backpackPanelOpen) closeBackpackPanel(); else openBackpackPanel();
        });
    }
    if (document.getElementById('player-action-ground-items')) {
        document.getElementById('player-action-ground-items').addEventListener('click', function () {
            if (!backpackPanelOpen) openBackpackPanel();
        });
    }
    if (document.getElementById('player-action-take-water')) {
        document.getElementById('player-action-take-water').addEventListener('click', onTakeWaterClick);
    }
    if (document.getElementById('player-action-pour-water')) {
        document.getElementById('player-action-pour-water').addEventListener('click', onPourWaterClick);
    }
    if (document.getElementById('player-action-add-fuel')) {
        document.getElementById('player-action-add-fuel').addEventListener('click', onAddFuelClick);
    }
    // 烹饪台面板（站在烹饪台格）
    var cookingStationPanelOpen = false;
    var cookingStationUiState = {
        method_id: '',
        inputs: [],
        /** 烹饪台模态：注水来源格子 `containerType|index` */
        selected_water_slot_key: '',
        /** 烹饪台模态：燃料来源格子 */
        selected_fuel_slot_key: ''
    };

    function getCookingIngredientOptionsFromInventory() {
        if (!IE) return [];
        var seen = {};
        var out = [];
        var groups = [
            IE.getPocketArray ? IE.getPocketArray() : [],
            IE.getVestArray ? IE.getVestArray() : [],
            IE.getBackpackArray ? IE.getBackpackArray() : []
        ];
        for (var g = 0; g < groups.length; g++) {
            var arr = groups[g];
            if (!Array.isArray(arr)) continue;
            for (var i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                var id = String(cell.item_id);
                if (seen[id]) continue;
                if (!isItemAllowedCookingIngredient(id)) continue;
                if (getInventoryCountByItemId(id) <= 0) continue;
                seen[id] = true;
                out.push(id);
            }
        }
        out.sort();
        return out;
    }

    function getItemDisplayNameSafe(itemId) {
        try {
            if (!IE || !itemId) return String(itemId || '');
            var tpl = IE.getItemTemplate ? IE.getItemTemplate(itemId) : null;
            var char0 = IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
            var tier0 = IE.getItemDisplayTier ? IE.getItemDisplayTier(itemId, char0) : 0;
            if (tpl && IE.getDisplayName) return IE.getDisplayName(tpl, tier0, char0) || itemId;
        } catch (e) { /* ignore */ }
        return String(itemId || '');
    }

    function setCookingMethodId(mid) {
        cookingStationUiState.method_id = (mid != null) ? String(mid) : '';
    }

    function setCookingInputs(list) {
        cookingStationUiState.inputs = normalizeCookingInputs(list || []);
    }

    function getStagedCookingCountForItem(itemId) {
        var arr = normalizeCookingInputs(cookingStationUiState.inputs || []);
        var i;
        for (i = 0; i < arr.length; i++) {
            if (String(arr[i].item_id) === String(itemId)) return parseInt(arr[i].count, 10) || 0;
        }
        return 0;
    }

    function tryAddOneCookingInputFromInventory(iid) {
        if (!cookingStationPanelOpen) return;
        iid = iid != null ? String(iid) : '';
        if (!iid) return;
        if (!isItemAllowedCookingIngredient(iid)) {
            showMsg(ui('cooking.try.fail.not_ingredient', { item: iid }), 'info');
            return;
        }
        var have = getInventoryCountByItemId(iid);
        var staged = getStagedCookingCountForItem(iid);
        if (have <= 0 || staged >= have) {
            showMsg(ui('cooking.try.fail.missing_inputs', { item: getItemDisplayNameSafe(iid) }), 'info');
            return;
        }
        var arr = normalizeCookingInputs(cookingStationUiState.inputs || []);
        arr.push({ item_id: iid, count: 1 });
        setCookingInputs(arr);
        renderCookingStationPanel();
    }

    function renderCookingIngredientPickerList() {
        var wrap = document.getElementById('cooking-ingredient-list');
        if (!wrap) return;
        var filterEl = document.getElementById('cooking-ingredient-filter');
        var f = filterEl && filterEl.value ? String(filterEl.value).trim().toLowerCase() : '';
        var opts = getCookingIngredientOptionsFromInventory();
        var char0 = IE && IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        wrap.innerHTML = '';
        var nShown = 0;
        var oi;
        for (oi = 0; oi < opts.length; oi++) {
            var iid = opts[oi];
            var disp = getItemDisplayNameSafe(iid);
            if (f && String(iid).toLowerCase().indexOf(f) < 0 && String(disp).toLowerCase().indexOf(f) < 0) continue;
            nShown++;
            var have = getInventoryCountByItemId(iid);
            var staged = getStagedCookingCountForItem(iid);
            var canAdd = have > 0 && staged < have;
            var row = document.createElement('div');
            row.className = 'cs-ingredient-row';
            var left = document.createElement('div');
            left.className = 'cs-ing-left';
            var nameEl = document.createElement('div');
            nameEl.className = 'cs-ing-name';
            nameEl.textContent = disp;
            var idEl = document.createElement('div');
            idEl.className = 'cs-ing-id';
            idEl.textContent = iid;
            left.appendChild(nameEl);
            left.appendChild(idEl);
            var countsEl = document.createElement('div');
            countsEl.className = 'cs-ing-counts';
            countsEl.textContent = ui('cooking.ingredient.available_staged_fmt', { have: String(have), staged: String(staged) });
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-add-ingredient';
            btn.setAttribute('data-ui', 'cooking.btn.add_input');
            btn.textContent = ui('cooking.btn.add_input');
            btn.disabled = !canAdd;
            btn.onclick = (function (xid) {
                return function (ev) {
                    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    tryAddOneCookingInputFromInventory(xid);
                };
            })(iid);
            row.appendChild(left);
            row.appendChild(countsEl);
            row.appendChild(btn);
            try {
                if (IE && typeof IE.getItemTemplate === 'function') {
                    var tpl = IE.getItemTemplate(iid);
                    if (tpl) {
                        var tier = IE.getItemDisplayTier ? IE.getItemDisplayTier(iid, char0) : 0;
                        var tipHtml = buildItemTooltipHtmlForTemplate(iid, tpl, null, char0);
                        row.addEventListener('mouseenter', function (h, elRef) { return function () { showItemTooltip(h, elRef); }; }(tipHtml, row));
                        row.addEventListener('mouseleave', hideItemTooltip);
                    }
                }
            } catch (eTip) { /* ignore */ }
            wrap.appendChild(row);
        }
        if (!opts.length) {
            wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('cooking.ingredient.empty') + '</div>';
        } else if (!nShown) {
            wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('cooking.ingredient.filter_empty') + '</div>';
        }
    }

    function uiCookingInventoryContainerLabel(containerType) {
        var t = String(containerType || '');
        if (t === 'pocket') return ui('cooking.station_resource.container.pocket');
        if (t === 'vest') return ui('cooking.station_resource.container.vest');
        if (t === 'backpack') return ui('cooking.station_resource.container.backpack');
        return t || '—';
    }

    function slotKeyInCookingSlotList(slots, key) {
        if (!key || !Array.isArray(slots)) return false;
        var si;
        for (si = 0; si < slots.length; si++) {
            if (cookingResourceSlotKey(slots[si].containerType, slots[si].index) === key) return true;
        }
        return false;
    }

    function renderCookingWaterFuelPickLists() {
        var waterWrap = document.getElementById('cooking-water-source-list');
        var fuelWrap = document.getElementById('cooking-fuel-source-list');
        if (!waterWrap || !fuelWrap) return;
        var char0 = IE && IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        var waterSlots = findAllContainerSlotsByPredicate(function (cell) {
            return getItemWaterPoints(cell.item_id) > 0;
        });
        var fuelSlots = findAllContainerSlotsByPredicate(function (cell) {
            return getItemFuelPoints(cell.item_id) > 0;
        });
        if (!slotKeyInCookingSlotList(waterSlots, cookingStationUiState.selected_water_slot_key)) {
            cookingStationUiState.selected_water_slot_key = '';
        }
        if (!slotKeyInCookingSlotList(fuelSlots, cookingStationUiState.selected_fuel_slot_key)) {
            cookingStationUiState.selected_fuel_slot_key = '';
        }

        function appendResourceRows(wrap, slots, kind, selectedKey) {
            wrap.innerHTML = '';
            var emptyKey = kind === 'water' ? 'cooking.station_resource.empty_water' : 'cooking.station_resource.empty_fuel';
            if (!slots.length) {
                wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui(emptyKey) + '</div>';
                return;
            }
            var ri;
            for (ri = 0; ri < slots.length; ri++) {
                (function (sl) {
                    var iid = sl.item.item_id;
                    var disp = getItemDisplayNameSafe(iid);
                    var cnt = (sl.item.count != null && parseInt(sl.item.count, 10) > 0) ? parseInt(sl.item.count, 10) : 1;
                    var gain = kind === 'water' ? getItemWaterPoints(iid) : getItemFuelPoints(iid);
                    var gainTxt = kind === 'water'
                        ? ui('cooking.station_resource.water_gain_fmt', { n: gain })
                        : ui('cooking.station_resource.fuel_gain_fmt', { n: gain });
                    var rowKey = cookingResourceSlotKey(sl.containerType, sl.index);
                    var row = document.createElement('div');
                    row.className = 'cs-ingredient-row cs-resource-pick' + (rowKey === selectedKey ? ' active' : '');
                    row.setAttribute('role', 'button');
                    var left = document.createElement('div');
                    left.className = 'cs-ing-left';
                    var nameEl = document.createElement('div');
                    nameEl.className = 'cs-ing-name';
                    nameEl.textContent = disp;
                    var idEl = document.createElement('div');
                    idEl.className = 'cs-ing-id';
                    idEl.textContent = String(iid) + ' · ' + uiCookingInventoryContainerLabel(sl.containerType) + ' #' + (sl.index + 1);
                    left.appendChild(nameEl);
                    left.appendChild(idEl);
                    var countsEl = document.createElement('div');
                    countsEl.className = 'cs-ing-counts';
                    var gLine = document.createElement('div');
                    gLine.textContent = gainTxt;
                    var sLine = document.createElement('div');
                    sLine.style.opacity = '0.9';
                    sLine.textContent = ui('cooking.station_resource.stack_fmt', { n: cnt });
                    countsEl.appendChild(gLine);
                    countsEl.appendChild(sLine);
                    row.appendChild(left);
                    row.appendChild(countsEl);
                    row.onclick = function (ev) {
                        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                        if (kind === 'water') {
                            cookingStationUiState.selected_water_slot_key = rowKey === cookingStationUiState.selected_water_slot_key ? '' : rowKey;
                        } else {
                            cookingStationUiState.selected_fuel_slot_key = rowKey === cookingStationUiState.selected_fuel_slot_key ? '' : rowKey;
                        }
                        renderCookingStationPanel();
                    };
                    try {
                        if (IE && typeof IE.getItemTemplate === 'function') {
                            var tpl = IE.getItemTemplate(iid);
                            if (tpl) {
                                var tier = IE.getItemDisplayTier ? IE.getItemDisplayTier(iid, char0) : 0;
                                var tipHtml = buildItemTooltipHtmlForTemplate(iid, tpl, null, char0);
                                row.addEventListener('mouseenter', function (h, elRef) { return function () { showItemTooltip(h, elRef); }; }(tipHtml, row));
                                row.addEventListener('mouseleave', hideItemTooltip);
                            }
                        }
                    } catch (eTip) { /* ignore */ }
                    wrap.appendChild(row);
                })(slots[ri]);
            }
        }

        appendResourceRows(waterWrap, waterSlots, 'water', cookingStationUiState.selected_water_slot_key);
        appendResourceRows(fuelWrap, fuelSlots, 'fuel', cookingStationUiState.selected_fuel_slot_key);
    }

    function renderCookingStationPanel() {
        var modal = document.getElementById('modal-cooking-station');
        if (!modal) return;
        var listEl = document.getElementById('cooking-input-list');
        var methodWrap = document.getElementById('cooking-method-list');
        var kvWrap = document.getElementById('cooking-status-kv');
        var knownWrap = document.getElementById('cooking-known-list');
        var helpEl = document.getElementById('cooking-help-text');
        var startBtn = document.getElementById('cooking-start-btn');
        var accessoryList = document.getElementById('cooking-accessory-list');
        var accessorySel = document.getElementById('cooking-add-accessory');

        var mid = cookingStationUiState.method_id ? String(cookingStationUiState.method_id) : '';
        // 默认选一个可用工艺
        if (!mid) {
            var ids = cookingMethods ? Object.keys(cookingMethods) : [];
            for (var mi = 0; mi < ids.length; mi++) {
                if (isCookingMethodUnlockedAtStation(ids[mi])) { mid = ids[mi]; break; }
            }
            if (mid) setCookingMethodId(mid);
        }

        // 工艺按钮（仅显示已解锁）
        if (methodWrap) {
            methodWrap.innerHTML = '';
            var mids = cookingMethods ? Object.keys(cookingMethods) : [];
            mids.sort(function (a, b) {
                var na = (cookingMethods[a] && cookingMethods[a].name) ? String(cookingMethods[a].name) : a;
                var nb = (cookingMethods[b] && cookingMethods[b].name) ? String(cookingMethods[b].name) : b;
                return na.localeCompare(nb, 'zh-Hans-CN');
            });
            for (var mx = 0; mx < mids.length; mx++) {
                var idm = mids[mx];
                if (!isCookingMethodUnlockedAtStation(idm)) continue;
                var mObj = cookingMethods[idm] || {};
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-method' + (String(idm) === String(mid) ? ' active' : '');
                btn.textContent = mObj.name ? String(mObj.name) : String(idm);
                btn.setAttribute('data-method-id', idm);
                btn.onclick = (function (xid) { return function () { setCookingMethodId(xid); renderCookingStationPanel(); }; })(idm);
                methodWrap.appendChild(btn);
            }
        }

        // 投料列表
        if (listEl) {
            listEl.innerHTML = '';
            var selected = normalizeCookingInputs(cookingStationUiState.inputs || []);
            cookingStationUiState.inputs = selected;
            if (!selected.length) {
                listEl.innerHTML = '';
            } else {
                for (var ii = 0; ii < selected.length; ii++) {
                    var row = document.createElement('div');
                    row.className = 'cs-input-row';
                    var id0 = selected[ii].item_id;
                    var c0 = parseInt(selected[ii].count, 10) || 1;
                    var nameEl = document.createElement('div');
                    nameEl.className = 'iname';
                    nameEl.textContent = getItemDisplayNameSafe(id0) + ' (' + String(id0) + ')';
                    var cntEl = document.createElement('div');
                    cntEl.className = 'icnt';
                    cntEl.textContent = 'x' + c0;
                    var btnDel = document.createElement('button');
                    btnDel.type = 'button';
                    btnDel.className = 'btn-mini';
                    btnDel.textContent = ui('cooking.btn.remove');
                    btnDel.onclick = (function (rid) {
                        return function () {
                            var arr = normalizeCookingInputs(cookingStationUiState.inputs || []);
                            var out = [];
                            for (var k = 0; k < arr.length; k++) if (String(arr[k].item_id) !== String(rid)) out.push(arr[k]);
                            setCookingInputs(out);
                            renderCookingStationPanel();
                        };
                    })(id0);
                    row.appendChild(nameEl);
                    row.appendChild(cntEl);
                    row.appendChild(btnDel);
                    listEl.appendChild(row);
                }
            }
        }

        renderCookingIngredientPickerList();

        // 配件安装/卸下
        var csAcc = getCookingStationState();
        var installed = Array.isArray(csAcc.installed_accessory_item_ids) ? csAcc.installed_accessory_item_ids.slice() : [];
        if (accessoryList) {
            accessoryList.innerHTML = '';
            if (!installed.length) {
                accessoryList.innerHTML = '';
            } else {
                for (var ai = 0; ai < installed.length; ai++) {
                    var aid = String(installed[ai]);
                    var arow = document.createElement('div');
                    arow.className = 'cs-input-row';
                    var aname = document.createElement('div');
                    aname.className = 'iname';
                    aname.textContent = getItemDisplayNameSafe(aid) + ' (' + aid + ')';
                    var abtn = document.createElement('button');
                    abtn.type = 'button';
                    abtn.className = 'btn-mini';
                    abtn.textContent = ui('cooking.btn.remove');
                    abtn.onclick = (function (rid) {
                        return function () {
                            var ret = uninstallCookingAccessoryToInventory(rid);
                            if (!ret || !ret.ok) {
                                showMsg(ui('cooking.accessory.uninstall_fail', { item: getItemDisplayNameSafe(rid) }), 'warn');
                            } else {
                                showMsg(ui('cooking.accessory.uninstall_ok', { item: getItemDisplayNameSafe(rid) }), 'success');
                            }
                            renderCookingStationPanel();
                            if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                            if (typeof updateStatusPanel === 'function') updateStatusPanel();
                            if (window.SceneRenderer) window.SceneRenderer.render();
                        };
                    })(aid);
                    arow.appendChild(aname);
                    arow.appendChild(abtn);
                    accessoryList.appendChild(arow);
                }
            }
        }
        if (accessorySel) {
            var prevAcc = accessorySel.value ? String(accessorySel.value) : '';
            var accOpts = getCookingAccessoryOptionsFromInventory(installed);
            accessorySel.innerHTML = '';
            for (var ax = 0; ax < accOpts.length; ax++) {
                var ao = accOpts[ax];
                var o = document.createElement('option');
                o.value = ao.item_id;
                o.textContent = getItemDisplayNameSafe(ao.item_id) + ' (' + ao.item_id + ') · ' + ui('cooking.inputs.available_fmt', { n: ao.count });
                accessorySel.appendChild(o);
            }
            if (prevAcc && accOpts.some(function (z) { return String(z.item_id) === prevAcc; })) accessorySel.value = prevAcc;
        }

        // 已知配方快捷填材（可选）
        if (knownWrap) {
            knownWrap.innerHTML = '';
            var knownIds = (window.SceneApp && typeof window.SceneApp.getKnownCookingRecipeIds === 'function') ? window.SceneApp.getKnownCookingRecipeIds() : [];
            if (!Array.isArray(knownIds) || !knownIds.length) {
                knownWrap.innerHTML = '';
            } else {
                for (var kr = 0; kr < knownIds.length; kr++) {
                    var rid = knownIds[kr];
                    var legacyRecipeKey = String(rid);
                    if (legacyRecipeKey.indexOf('life_cooking.') === 0) {
                        legacyRecipeKey = legacyRecipeKey.slice('life_cooking.'.length);
                    }
                    var rec = null;
                    var rr;
                    for (rr = 0; rr < cookingRecipes.length; rr++) {
                        if (String(cookingRecipes[rr].recipe_id) === legacyRecipeKey) { rec = cookingRecipes[rr]; break; }
                    }
                    if (!rec) {
                        for (rr = 0; rr < cookingRecipes.length; rr++) {
                            if (String(cookingRecipes[rr].recipe_id) === String(rid)) { rec = cookingRecipes[rr]; break; }
                        }
                    }
                    if (!rec) continue;
                    var btnK = document.createElement('button');
                    btnK.type = 'button';
                    btnK.className = 'btn-known';
                    var rName = rid;
                    try {
                        if (window.UIText && typeof window.UIText.t === 'function') {
                            rName = window.UIText.t('cooking.recipe.' + legacyRecipeKey);
                        }
                    } catch (eKn) { rName = rid; }
                    btnK.textContent = rName;
                    btnK.onclick = (function (rx) {
                        return function () {
                            if (rx.required_method) setCookingMethodId(rx.required_method);
                            setCookingInputs(rx.inputs || []);
                            renderCookingStationPanel();
                        };
                    })(rec);
                    knownWrap.appendChild(btnK);
                }
            }
        }

        // 状态区
        var mSel = (cookingMethods && mid && cookingMethods[String(mid)]) ? cookingMethods[String(mid)] : null;
        var cs = getCookingStationState();
        var curFuel = parseInt(cs.fuel_points, 10) || 0;
        var curWater = parseInt(cs.water_points, 10) || 0;
        var needFuel = mSel ? Math.max(0, parseInt(mSel.fuel_cost, 10) || 0) : 0;
        var needWater = mSel ? Math.max(0, parseInt(mSel.water_cost, 10) || 0) : 0;
        var needTicks = mSel ? Math.max(0, parseInt(mSel.craft_ticks, 10) || 0) : 0;
        var needStamina = mSel ? Math.max(0, parseInt(mSel.stamina_cost, 10) || 0) : 0;
        var survState = window.Survival && typeof window.Survival.getState === 'function' ? window.Survival.getState() : null;
        var curStamina = survState ? Number(survState.stamina || 0) : 0;
        var activeCraft = getActiveCookingCraft();

        if (kvWrap) {
            kvWrap.innerHTML = '';
            function addKv(text, bad) {
                var d = document.createElement('div');
                d.className = 'kv' + (bad ? ' bad' : '');
                d.textContent = text;
                kvWrap.appendChild(d);
            }
            addKv(ui('cooking.kv.fuel', { cur: curFuel, max: COOKING_FUEL_MAX_POINTS, need: needFuel }), curFuel < needFuel);
            var panelCtx = getCurrentCookingStationContext();
            var mainWaterUnl = !!(panelCtx && panelCtx.station_type === 'main' && cs.water_unlimited);
            if (mainWaterUnl) {
                addKv(ui('cooking.kv.water_unlimited', { need: needWater }), false);
            } else {
                addKv(ui('cooking.kv.water', { cur: curWater, max: COOKING_WATER_MAX_POINTS, need: needWater }), curWater < needWater);
            }
            addKv(ui('cooking.kv.ticks', { n: needTicks }), false);
            addKv(ui('cooking.kv.stamina', { cur: curStamina, need: needStamina }), curStamina < needStamina);
            if (activeCraft) addKv(ui('cooking.kv.remaining', { n: activeCraft.remaining_ticks }), false);
        }

        renderCookingWaterFuelPickLists();

        if (helpEl) helpEl.innerHTML = '';

        var okStart = !!(mid && normalizeCookingInputs(cookingStationUiState.inputs || []).length) && !activeCraft;
        if (startBtn) {
            startBtn.disabled = !okStart;
        }

        var pourModalBtn = document.getElementById('cooking-modal-pour-btn');
        var fuelModalBtn = document.getElementById('cooking-modal-add-fuel-btn');
        var pourModalOk = canPourWaterAtCurrentTile() && !!cookingStationUiState.selected_water_slot_key;
        var fuelModalOk = canAddFuelAtCurrentTile() && !!cookingStationUiState.selected_fuel_slot_key;
        if (pourModalBtn) pourModalBtn.disabled = !pourModalOk;
        if (fuelModalBtn) fuelModalBtn.disabled = !fuelModalOk;

        if (window.UIText && typeof window.UIText.applyDom === 'function') {
            try { window.UIText.applyDom(modal); } catch (eApply) { /* ignore */ }
        }
    }

    function cookingStartReasonToMsgKey(reason) {
        var r = reason != null ? String(reason) : '';
        if (r === 'not_on_cooking_station') return 'cooking.station.not_on_tile';
        if (r === 'method_required') return 'cooking.try.fail.method_required';
        if (r === 'method_not_found') return 'cooking.try.fail.method_not_found';
        if (r === 'cooking_method_locked') return 'cooking.try.fail.method_locked';
        if (r === 'empty_inputs') return 'cooking.try.fail.empty_inputs';
        if (r === 'not_cooking_ingredient') return 'cooking.try.fail.not_ingredient';
        if (r === 'missing_input_items') return 'cooking.try.fail.missing_inputs';
        if (r === 'insufficient_fuel') return 'cooking.try.fail.insufficient_fuel';
        if (r === 'insufficient_water') return 'cooking.try.fail.insufficient_water';
        if (r === 'insufficient_stamina') return 'cooking.try.fail.insufficient_stamina';
        if (r === 'inventory_full') return 'cooking.try.fail.inventory_full';
        if (r === 'consume_inputs_failed') return 'cooking.try.fail.consume_failed';
        if (r === 'bad_args') return 'cooking.try.fail.bad_args';
        if (r === 'craft_in_progress') return 'cooking.try.fail.craft_in_progress';
        if (r === 'cooking_station_repair_locked') return 'cooking.try.fail.repair_locked';
        return 'cooking.try.fail.unknown';
    }

    function openCookingStationPanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (guardPlayerComaBlocked()) return;
        if (cookingStationPanelOpen) return;
        if (!isOnCookingStationTile()) {
            showMsg(ui('cooking.station.not_on_tile'), 'info');
            return;
        }
        if (isCookingUiBlockedByRepair()) {
            showMsg(ui('cooking.station.locked_until_repaired'), 'info');
            return;
        }
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        cookingStationPanelOpen = true;
        cookingStationUiState.selected_water_slot_key = '';
        cookingStationUiState.selected_fuel_slot_key = '';
        var modal = document.getElementById('modal-cooking-station');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        renderCookingStationPanel();
        render();
    }

    function closeCookingStationPanel() {
        if (!cookingStationPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        cookingStationPanelOpen = false;
        var modal = document.getElementById('modal-cooking-station');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        render();
    }

    (function bindCookingStationPanel() {
        var abCook = document.getElementById('action-bar-cook');
        if (abCook) {
            abCook.addEventListener('click', function () {
                if (cookingStationPanelOpen) closeCookingStationPanel(); else openCookingStationPanel();
            });
        }
        var bubCook = document.getElementById('player-action-cook');
        if (bubCook) {
            bubCook.addEventListener('click', function () {
                if (!cookingStationPanelOpen) openCookingStationPanel();
            });
        }
        var closeBtn = document.getElementById('cooking-station-close');
        if (closeBtn) closeBtn.addEventListener('click', closeCookingStationPanel);
        var ingFilter = document.getElementById('cooking-ingredient-filter');
        if (ingFilter && !ingFilter._cookingFilterBound) {
            ingFilter._cookingFilterBound = true;
            ingFilter.addEventListener('input', function () {
                if (cookingStationPanelOpen) renderCookingStationPanel();
            });
        }
        var clearBtn = document.getElementById('cooking-clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', function () { if (!cookingStationPanelOpen) return; setCookingInputs([]); renderCookingStationPanel(); });
        var pourMb = document.getElementById('cooking-modal-pour-btn');
        if (pourMb && !pourMb._cookingSrvBound) {
            pourMb._cookingSrvBound = true;
            pourMb.addEventListener('click', function () {
                if (!cookingStationPanelOpen) return;
                var wk = cookingStationUiState.selected_water_slot_key ? String(cookingStationUiState.selected_water_slot_key) : '';
                if (!wk) {
                    showMsg(ui('cooking.pour_water.pick_first'), 'info');
                    return;
                }
                var pw = parseCookingResourceSlotKey(wk);
                if (!pw) {
                    showMsg(ui('cooking.pour_water.pick_first'), 'info');
                    return;
                }
                onPourWaterClick({ containerType: pw.containerType, index: pw.index });
                renderCookingStationPanel();
                if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
                if (window.SceneRenderer) window.SceneRenderer.render();
            });
        }
        var fuelMb = document.getElementById('cooking-modal-add-fuel-btn');
        if (fuelMb && !fuelMb._cookingSrvBound) {
            fuelMb._cookingSrvBound = true;
            fuelMb.addEventListener('click', function () {
                if (!cookingStationPanelOpen) return;
                var fk = cookingStationUiState.selected_fuel_slot_key ? String(cookingStationUiState.selected_fuel_slot_key) : '';
                if (!fk) {
                    showMsg(ui('cooking.add_fuel.pick_first'), 'info');
                    return;
                }
                var pf = parseCookingResourceSlotKey(fk);
                if (!pf) {
                    showMsg(ui('cooking.add_fuel.pick_first'), 'info');
                    return;
                }
                onAddFuelClick({ containerType: pf.containerType, index: pf.index });
                renderCookingStationPanel();
                if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
                if (window.SceneRenderer) window.SceneRenderer.render();
            });
        }
        var addAccessoryBtn = document.getElementById('cooking-add-accessory-btn');
        if (addAccessoryBtn) {
            addAccessoryBtn.addEventListener('click', function () {
                if (!cookingStationPanelOpen) return;
                var sel = document.getElementById('cooking-add-accessory');
                var aid = sel && sel.value ? String(sel.value) : '';
                if (!aid) return;
                var ret = installCookingAccessoryFromInventory(aid);
                if (!ret || !ret.ok) {
                    showMsg(ui('cooking.accessory.install_fail', { item: getItemDisplayNameSafe(aid) }), 'warn');
                    renderCookingStationPanel();
                    return;
                }
                showMsg(ui('cooking.accessory.install_ok', { item: getItemDisplayNameSafe(aid) }), 'success');
                renderCookingStationPanel();
                if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
                if (window.SceneRenderer) window.SceneRenderer.render();
            });
        }
        var startBtn = document.getElementById('cooking-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', function () {
                if (!cookingStationPanelOpen) return;
                var mid = cookingStationUiState.method_id ? String(cookingStationUiState.method_id) : '';
                var inputs = normalizeCookingInputs(cookingStationUiState.inputs || []);
                var res = tryCookAtStation(mid, inputs);
                if (!res || res.ok !== true) {
                    var key = cookingStartReasonToMsgKey(res ? res.reason : 'unknown');
                    var vars = {};
                    if (res && res.item_id) vars.item = getItemDisplayNameSafe(res.item_id);
                    if (res && res.method_id) vars.method = String(res.method_id);
                    if (res && res.required_accessory_item_id) vars.accessory = getItemDisplayNameSafe(res.required_accessory_item_id);
                    if (res && res.need != null && res.current != null) { vars.need = res.need; vars.cur = res.current; }
                    showMsg(ui(key, vars), 'warn');
                    renderCookingStationPanel();
                    return;
                }
                // tryCookAtStation 成功路径内部已负责 showMsg；这里清空投料便于下一次盲配
                setCookingInputs([]);
                renderCookingStationPanel();
            });
        }
    })();

    // === Pharmacy Station Pane ===
    var pharmacyStationPanelOpen = false;
    var pharmacyStationUiState = {
        method_id: '',
        inputs: [],
        /** 烹饪台模态：燃料来源格子 */
        selected_fuel_slot_key: ''
    };

    function getPharmacyIngredientOptionsFromInventory() {
        if (!IE) return [];
        var seen = {};
        var out = [];
        var groups = [
            IE.getPocketArray ? IE.getPocketArray() : [],
            IE.getVestArray ? IE.getVestArray() : [],
            IE.getBackpackArray ? IE.getBackpackArray() : []
        ];
        for (var g = 0; g < groups.length; g++) {
            var arr = groups[g];
            if (!Array.isArray(arr)) continue;
            for (var i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                var id = String(cell.item_id);
                if (seen[id]) continue;
                if (!isItemAllowedPharmacyIngredient(id)) continue;
                if (getInventoryCountByItemId(id) <= 0) continue;
                seen[id] = true;
                out.push(id);
            }
        }
        out.sort();
        return out;
    }

    function getItemDisplayNameSafe(itemId) {
        try {
            if (!IE || !itemId) return String(itemId || '');
            var tpl = IE.getItemTemplate ? IE.getItemTemplate(itemId) : null;
            var char0 = IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
            var tier0 = IE.getItemDisplayTier ? IE.getItemDisplayTier(itemId, char0) : 0;
            if (tpl && IE.getDisplayName) return IE.getDisplayName(tpl, tier0, char0) || itemId;
        } catch (e) { /* ignore */ }
        return String(itemId || '');
    }

    function setPharmacyMethodId(mid) {
        pharmacyStationUiState.method_id = (mid != null) ? String(mid) : '';
    }

    function setPharmacyInputs(list) {
        pharmacyStationUiState.inputs = normalizePharmacyInputs(list || []);
    }

    function getStagedPharmacyCountForItem(itemId) {
        var arr = normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
        var i;
        for (i = 0; i < arr.length; i++) {
            if (String(arr[i].item_id) === String(itemId)) return parseInt(arr[i].count, 10) || 0;
        }
        return 0;
    }

    function tryAddOnePharmacyInputFromInventory(iid) {
        if (!pharmacyStationPanelOpen) return;
        iid = iid != null ? String(iid) : '';
        if (!iid) return;
        if (!isItemAllowedPharmacyIngredient(iid)) {
            showMsg(ui('pharmacy.try.fail.not_ingredient', { item: iid }), 'info');
            return;
        }
        var have = getInventoryCountByItemId(iid);
        var staged = getStagedPharmacyCountForItem(iid);
        if (have <= 0 || staged >= have) {
            showMsg(ui('pharmacy.try.fail.missing_inputs', { item: getItemDisplayNameSafe(iid) }), 'info');
            return;
        }
        var arr = normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
        arr.push({ item_id: iid, count: 1 });
        setPharmacyInputs(arr);
        renderPharmacyStationPanel();
    }

    function renderPharmacyIngredientPickerList() {
        var wrap = document.getElementById('pharmacy-ingredient-list');
        if (!wrap) return;
        var filterEl = document.getElementById('pharmacy-ingredient-filter');
        var f = filterEl && filterEl.value ? String(filterEl.value).trim().toLowerCase() : '';
        var opts = getPharmacyIngredientOptionsFromInventory();
        var char0 = IE && IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        wrap.innerHTML = '';
        var nShown = 0;
        var oi;
        for (oi = 0; oi < opts.length; oi++) {
            var iid = opts[oi];
            var disp = getItemDisplayNameSafe(iid);
            if (f && String(iid).toLowerCase().indexOf(f) < 0 && String(disp).toLowerCase().indexOf(f) < 0) continue;
            nShown++;
            var have = getInventoryCountByItemId(iid);
            var staged = getStagedPharmacyCountForItem(iid);
            var canAdd = have > 0 && staged < have;
            var row = document.createElement('div');
            row.className = 'cs-ingredient-row';
            var left = document.createElement('div');
            left.className = 'cs-ing-left';
            var nameEl = document.createElement('div');
            nameEl.className = 'cs-ing-name';
            nameEl.textContent = disp;
            var idEl = document.createElement('div');
            idEl.className = 'cs-ing-id';
            idEl.textContent = iid;
            left.appendChild(nameEl);
            left.appendChild(idEl);
            var countsEl = document.createElement('div');
            countsEl.className = 'cs-ing-counts';
            countsEl.textContent = ui('pharmacy.ingredient.available_staged_fmt', { have: String(have), staged: String(staged) });
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-add-ingredient';
            btn.setAttribute('data-ui', 'pharmacy.btn.add_input');
            btn.textContent = ui('pharmacy.btn.add_input');
            btn.disabled = !canAdd;
            btn.onclick = (function (xid) {
                return function (ev) {
                    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    tryAddOnePharmacyInputFromInventory(xid);
                };
            })(iid);
            row.appendChild(left);
            row.appendChild(countsEl);
            row.appendChild(btn);
            try {
                if (IE && typeof IE.getItemTemplate === 'function') {
                    var tpl = IE.getItemTemplate(iid);
                    if (tpl) {
                        var tier = IE.getItemDisplayTier ? IE.getItemDisplayTier(iid, char0) : 0;
                        var tipHtml = buildItemTooltipHtmlForTemplate(iid, tpl, null, char0);
                        row.addEventListener('mouseenter', function (h, elRef) { return function () { showItemTooltip(h, elRef); }; }(tipHtml, row));
                        row.addEventListener('mouseleave', hideItemTooltip);
                    }
                }
            } catch (eTip) { /* ignore */ }
            wrap.appendChild(row);
        }
        if (!opts.length) {
            wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('pharmacy.ingredient.empty') + '</div>';
        } else if (!nShown) {
            wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('pharmacy.ingredient.filter_empty') + '</div>';
        }
    }

    function uiPharmacyInventoryContainerLabel(containerType) {
        var t = String(containerType || '');
        if (t === 'pocket') return ui('pharmacy.station_resource.container.pocket');
        if (t === 'vest') return ui('pharmacy.station_resource.container.vest');
        if (t === 'backpack') return ui('pharmacy.station_resource.container.backpack');
        return t || '—';
    }

    function slotKeyInPharmacySlotList(slots, key) {
        if (!key || !Array.isArray(slots)) return false;
        var si;
        for (si = 0; si < slots.length; si++) {
            if (pharmacyResourceSlotKey(slots[si].containerType, slots[si].index) === key) return true;
        }
        return false;
    }

    function renderPharmacyWaterFuelPickLists() {
        var fuelWrap = document.getElementById('pharmacy-fuel-source-list');
        if (!fuelWrap) return;
        var char0 = IE && IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        var fuelSlots = findAllContainerSlotsByPredicate(function (cell) {
            return getItemFuelPoints(cell.item_id) > 0;
        });
        if (!slotKeyInPharmacySlotList(fuelSlots, pharmacyStationUiState.selected_fuel_slot_key)) {
            pharmacyStationUiState.selected_fuel_slot_key = '';
        }

        function appendResourceRows(wrap, slots, kind, selectedKey) {
            wrap.innerHTML = '';
            var emptyKey = 'pharmacy.station_resource.empty_fuel';
            if (!slots.length) {
                wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui(emptyKey) + '</div>';
                return;
            }
            var ri;
            for (ri = 0; ri < slots.length; ri++) {
                (function (sl) {
                    var iid = sl.item.item_id;
                    var disp = getItemDisplayNameSafe(iid);
                    var cnt = (sl.item.count != null && parseInt(sl.item.count, 10) > 0) ? parseInt(sl.item.count, 10) : 1;
                    var gain = getItemFuelPoints(iid);
                    var gainTxt = ui('pharmacy.station_resource.fuel_gain_fmt', { n: gain });
                    var rowKey = pharmacyResourceSlotKey(sl.containerType, sl.index);
                    var row = document.createElement('div');
                    row.className = 'cs-ingredient-row cs-resource-pick' + (rowKey === selectedKey ? ' active' : '');
                    row.setAttribute('role', 'button');
                    var left = document.createElement('div');
                    left.className = 'cs-ing-left';
                    var nameEl = document.createElement('div');
                    nameEl.className = 'cs-ing-name';
                    nameEl.textContent = disp;
                    var idEl = document.createElement('div');
                    idEl.className = 'cs-ing-id';
                    idEl.textContent = String(iid) + ' · ' + uiPharmacyInventoryContainerLabel(sl.containerType) + ' #' + (sl.index + 1);
                    left.appendChild(nameEl);
                    left.appendChild(idEl);
                    var countsEl = document.createElement('div');
                    countsEl.className = 'cs-ing-counts';
                    var gLine = document.createElement('div');
                    gLine.textContent = gainTxt;
                    var sLine = document.createElement('div');
                    sLine.style.opacity = '0.9';
                    sLine.textContent = ui('pharmacy.station_resource.stack_fmt', { n: cnt });
                    countsEl.appendChild(gLine);
                    countsEl.appendChild(sLine);
                    row.appendChild(left);
                    row.appendChild(countsEl);
                    row.onclick = function (ev) {
                        if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                        pharmacyStationUiState.selected_fuel_slot_key = rowKey === pharmacyStationUiState.selected_fuel_slot_key ? '' : rowKey;
                        renderPharmacyStationPanel();
                    };
                    try {
                        if (IE && typeof IE.getItemTemplate === 'function') {
                            var tpl = IE.getItemTemplate(iid);
                            if (tpl) {
                                var tier = IE.getItemDisplayTier ? IE.getItemDisplayTier(iid, char0) : 0;
                                var tipHtml = buildItemTooltipHtmlForTemplate(iid, tpl, null, char0);
                                row.addEventListener('mouseenter', function (h, elRef) { return function () { showItemTooltip(h, elRef); }; }(tipHtml, row));
                                row.addEventListener('mouseleave', hideItemTooltip);
                            }
                        }
                    } catch (eTip) { /* ignore */ }
                    wrap.appendChild(row);
                })(slots[ri]);
            }
        }

        appendResourceRows(fuelWrap, fuelSlots, 'fuel', pharmacyStationUiState.selected_fuel_slot_key);
    }

    function renderPharmacyStationPanel() {
        var modal = document.getElementById('modal-pharmacy-station');
        if (!modal) return;
        var listEl = document.getElementById('pharmacy-input-list');
        var methodWrap = document.getElementById('pharmacy-method-list');
        var kvWrap = document.getElementById('pharmacy-status-kv');
        var knownWrap = document.getElementById('pharmacy-known-list');
        var helpEl = document.getElementById('pharmacy-help-text');
        var startBtn = document.getElementById('pharmacy-start-btn');
        var accessoryList = document.getElementById('pharmacy-accessory-list');
        var accessorySel = document.getElementById('pharmacy-add-accessory');

        var mid = pharmacyStationUiState.method_id ? String(pharmacyStationUiState.method_id) : '';
        // 默认选一个可用工艺
        if (!mid) {
            var ids = pharmacyMethods ? Object.keys(pharmacyMethods) : [];
            for (var mi = 0; mi < ids.length; mi++) {
                if (isPharmacyMethodUnlockedAtStation(ids[mi])) { mid = ids[mi]; break; }
            }
            if (mid) setPharmacyMethodId(mid);
        }

        // 工艺按钮（仅显示已解锁）
        if (methodWrap) {
            methodWrap.innerHTML = '';
            var mids = pharmacyMethods ? Object.keys(pharmacyMethods) : [];
            mids.sort(function (a, b) {
                var na = getPharmacyMethodDisplayName(a, pharmacyMethods[a]);
                var nb = getPharmacyMethodDisplayName(b, pharmacyMethods[b]);
                return na.localeCompare(nb, 'zh-Hans-CN');
            });
            for (var mx = 0; mx < mids.length; mx++) {
                var idm = mids[mx];
                if (!isPharmacyMethodUnlockedAtStation(idm)) continue;
                var mObj = pharmacyMethods[idm] || {};
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-method' + (String(idm) === String(mid) ? ' active' : '');
                btn.textContent = getPharmacyMethodDisplayName(idm, mObj);
                btn.setAttribute('data-method-id', idm);
                btn.onclick = (function (xid) { return function () { setPharmacyMethodId(xid); renderPharmacyStationPanel(); }; })(idm);
                methodWrap.appendChild(btn);
            }
        }

        // 投料列表
        if (listEl) {
            listEl.innerHTML = '';
            var selected = normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
            pharmacyStationUiState.inputs = selected;
            if (!selected.length) {
                listEl.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('pharmacy.inputs.empty') + '</div>';
            } else {
                for (var ii = 0; ii < selected.length; ii++) {
                    var row = document.createElement('div');
                    row.className = 'cs-input-row';
                    var id0 = selected[ii].item_id;
                    var c0 = parseInt(selected[ii].count, 10) || 1;
                    var nameEl = document.createElement('div');
                    nameEl.className = 'iname';
                    nameEl.textContent = getItemDisplayNameSafe(id0) + ' (' + String(id0) + ')';
                    var cntEl = document.createElement('div');
                    cntEl.className = 'icnt';
                    cntEl.textContent = 'x' + c0;
                    var btnDel = document.createElement('button');
                    btnDel.type = 'button';
                    btnDel.className = 'btn-mini';
                    btnDel.textContent = ui('pharmacy.btn.remove');
                    btnDel.onclick = (function (rid) {
                        return function () {
                            var arr = normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
                            var out = [];
                            for (var k = 0; k < arr.length; k++) if (String(arr[k].item_id) !== String(rid)) out.push(arr[k]);
                            setPharmacyInputs(out);
                            renderPharmacyStationPanel();
                        };
                    })(id0);
                    row.appendChild(nameEl);
                    row.appendChild(cntEl);
                    row.appendChild(btnDel);
                    listEl.appendChild(row);
                }
            }
        }

        renderPharmacyIngredientPickerList();

        // 配件安装/卸下
        var csAcc = getPharmacyStationState();
        var installed = Array.isArray(csAcc.installed_accessory_item_ids) ? csAcc.installed_accessory_item_ids.slice() : [];
        if (accessoryList) {
            accessoryList.innerHTML = '';
            if (!installed.length) {
                accessoryList.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('pharmacy.accessory.empty') + '</div>';
            } else {
                for (var ai = 0; ai < installed.length; ai++) {
                    var aid = String(installed[ai]);
                    var arow = document.createElement('div');
                    arow.className = 'cs-input-row';
                    var aname = document.createElement('div');
                    aname.className = 'iname';
                    aname.textContent = getItemDisplayNameSafe(aid) + ' (' + aid + ')';
                    var abtn = document.createElement('button');
                    abtn.type = 'button';
                    abtn.className = 'btn-mini';
                    abtn.textContent = ui('pharmacy.btn.remove');
                    abtn.onclick = (function (rid) {
                        return function () {
                            var ret = uninstallPharmacyAccessoryToInventory(rid);
                            if (!ret || !ret.ok) {
                                showMsg(ui('pharmacy.accessory.uninstall_fail', { item: getItemDisplayNameSafe(rid) }), 'warn');
                            } else {
                                showMsg(ui('pharmacy.accessory.uninstall_ok', { item: getItemDisplayNameSafe(rid) }), 'success');
                            }
                            renderPharmacyStationPanel();
                            if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                            if (typeof updateStatusPanel === 'function') updateStatusPanel();
                            if (window.SceneRenderer) window.SceneRenderer.render();
                        };
                    })(aid);
                    arow.appendChild(aname);
                    arow.appendChild(abtn);
                    accessoryList.appendChild(arow);
                }
            }
        }
        if (accessorySel) {
            var prevAcc = accessorySel.value ? String(accessorySel.value) : '';
            var accOpts = getPharmacyAccessoryOptionsFromInventory(installed);
            accessorySel.innerHTML = '';
            for (var ax = 0; ax < accOpts.length; ax++) {
                var ao = accOpts[ax];
                var o = document.createElement('option');
                o.value = ao.item_id;
                o.textContent = getItemDisplayNameSafe(ao.item_id) + ' (' + ao.item_id + ') · ' + ui('pharmacy.inputs.available_fmt', { n: ao.count });
                accessorySel.appendChild(o);
            }
            if (prevAcc && accOpts.some(function (z) { return String(z.item_id) === prevAcc; })) accessorySel.value = prevAcc;
        }

        // 已知配方快捷填材（可选）
        if (knownWrap) {
            knownWrap.innerHTML = '';
            var knownIds = (window.SceneApp && typeof window.SceneApp.getKnownPharmacyRecipeIds === 'function') ? window.SceneApp.getKnownPharmacyRecipeIds() : [];
            if (!Array.isArray(knownIds) || !knownIds.length) {
                knownWrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('pharmacy.known.empty') + '</div>';
            } else {
                for (var kr = 0; kr < knownIds.length; kr++) {
                    var rid = knownIds[kr];
                    var legacyRecipeKey = String(rid);
                    if (legacyRecipeKey.indexOf('life_pharmacy.') === 0) {
                        legacyRecipeKey = legacyRecipeKey.slice('life_pharmacy.'.length);
                    }
                    var rec = null;
                    var rr;
                    for (rr = 0; rr < pharmacyRecipes.length; rr++) {
                        if (String(pharmacyRecipes[rr].recipe_id) === legacyRecipeKey) { rec = pharmacyRecipes[rr]; break; }
                    }
                    if (!rec) {
                        for (rr = 0; rr < pharmacyRecipes.length; rr++) {
                            if (String(pharmacyRecipes[rr].recipe_id) === String(rid)) { rec = pharmacyRecipes[rr]; break; }
                        }
                    }
                    if (!rec) continue;
                    var btnK = document.createElement('button');
                    btnK.type = 'button';
                    btnK.className = 'btn-known';
                    var rName = rid;
                    try {
                        if (window.UIText && typeof window.UIText.t === 'function') {
                            rName = window.UIText.t('pharmacy.recipe.' + legacyRecipeKey);
                        }
                    } catch (eKn) { rName = rid; }
                    btnK.textContent = rName;
                    btnK.onclick = (function (rx) {
                        return function () {
                            if (rx.method_id || rx.required_method) setPharmacyMethodId(rx.method_id || rx.required_method);
                            setPharmacyInputs(rx.inputs || []);
                            renderPharmacyStationPanel();
                        };
                    })(rec);
                    knownWrap.appendChild(btnK);
                }
            }
        }

        // 状态区
        var mSel = (pharmacyMethods && mid && pharmacyMethods[String(mid)]) ? pharmacyMethods[String(mid)] : null;
        var cs = getPharmacyStationState();
        var curFuel = parseInt(cs.fuel_points, 10) || 0;
        var needFuel = mSel ? readMethodCostValue(mSel, 'fuel', 'fuel_cost') : 0;
        var needTicks = mSel ? readMethodCostValue(mSel, 'ticks', 'craft_ticks') : 0;
        var needStamina = mSel ? readMethodCostValue(mSel, 'stamina', 'stamina_cost') : 0;
        var survState = window.Survival && typeof window.Survival.getState === 'function' ? window.Survival.getState() : null;
        var curStamina = survState ? Number(survState.stamina || 0) : 0;
        var activeCraft = getActivePharmacyCraft();

        if (kvWrap) {
            kvWrap.innerHTML = '';
            function addKv(text, bad) {
                var d = document.createElement('div');
                d.className = 'kv' + (bad ? ' bad' : '');
                d.textContent = text;
                kvWrap.appendChild(d);
            }
            addKv(ui('pharmacy.kv.fuel', { cur: curFuel, max: PHARMACY_FUEL_MAX_POINTS, need: needFuel }), curFuel < needFuel);
            addKv(ui('pharmacy.kv.ticks', { n: needTicks }), false);
            addKv(ui('pharmacy.kv.stamina', { cur: curStamina, need: needStamina }), curStamina < needStamina);
            if (activeCraft) addKv(ui('pharmacy.kv.remaining', { n: activeCraft.remaining_ticks }), false);
        }

        renderPharmacyWaterFuelPickLists();

        if (helpEl) {
            helpEl.innerHTML = '';
            var lines = [
                ui('pharmacy.help.line1'),
                ui('pharmacy.help.line2'),
                ui('pharmacy.help.line3'),
                ui('pharmacy.help.line4')
            ];
            helpEl.innerHTML = '<div style="color:#a8a29e;line-height:1.65;">' + lines.map(function (s) {
                return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }).join('<br>') + '</div>';
        }

        var okStart = !!(mid && normalizePharmacyInputs(pharmacyStationUiState.inputs || []).length) && !activeCraft;
        if (startBtn) {
            startBtn.disabled = !okStart;
        }

        var fuelModalBtn = document.getElementById('pharmacy-modal-add-fuel-btn');
        var fuelModalOk = canAddFuelAtCurrentTile() && !!pharmacyStationUiState.selected_fuel_slot_key;
        if (fuelModalBtn) fuelModalBtn.disabled = !fuelModalOk;

        if (window.UIText && typeof window.UIText.applyDom === 'function') {
            try { window.UIText.applyDom(modal); } catch (eApply) { /* ignore */ }
        }
    }

    function pharmacyStartReasonToMsgKey(reason) {
        var r = reason != null ? String(reason) : '';
        if (r === 'not_on_pharmacy_station') return 'pharmacy.station.not_on_tile';
        if (r === 'method_required') return 'pharmacy.try.fail.method_required';
        if (r === 'method_not_found') return 'pharmacy.try.fail.method_not_found';
        if (r === 'pharmacy_method_locked') return 'pharmacy.try.fail.method_locked';
        if (r === 'empty_inputs') return 'pharmacy.try.fail.empty_inputs';
        if (r === 'not_pharmacy_ingredient') return 'pharmacy.try.fail.not_ingredient';
        if (r === 'missing_input_items') return 'pharmacy.try.fail.missing_inputs';
        if (r === 'insufficient_fuel') return 'pharmacy.try.fail.insufficient_fuel';
        if (r === 'insufficient_stamina') return 'pharmacy.try.fail.insufficient_stamina';
        if (r === 'inventory_full') return 'pharmacy.try.fail.inventory_full';
        if (r === 'consume_inputs_failed') return 'pharmacy.try.fail.consume_failed';
        if (r === 'bad_args') return 'pharmacy.try.fail.bad_args';
        if (r === 'craft_in_progress') return 'pharmacy.try.fail.craft_in_progress';
        if (r === 'pharmacy_station_repair_locked') return 'pharmacy.try.fail.repair_locked';
        return 'pharmacy.try.fail.unknown';
    }

    function openPharmacyStationPanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (guardPlayerComaBlocked()) return;
        if (pharmacyStationPanelOpen) return;
        if (!isOnPharmacyStationTile()) {
            showMsg(ui('pharmacy.station.not_on_tile'), 'info');
            return;
        }
        if (isPharmacyUiBlockedByRepair()) {
            showMsg(ui('pharmacy.station.locked_until_repaired'), 'info');
            return;
        }
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        pharmacyStationPanelOpen = true;
        pharmacyStationUiState.selected_fuel_slot_key = '';
        var modal = document.getElementById('modal-pharmacy-station');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        renderPharmacyStationPanel();
        render();
    }

    function closePharmacyStationPanel() {
        if (!pharmacyStationPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        pharmacyStationPanelOpen = false;
        var modal = document.getElementById('modal-pharmacy-station');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        render();
    }

    (function bindPharmacyStationPanel() {
        var abPharmacy = document.getElementById('action-bar-pharmacy');
        if (abPharmacy) {
            abPharmacy.addEventListener('click', function () {
                if (pharmacyStationPanelOpen) closePharmacyStationPanel(); else openPharmacyStationPanel();
            });
        }
        var bubPharmacy = document.getElementById('player-action-pharmacy');
        if (bubPharmacy) {
            bubPharmacy.addEventListener('click', function () {
                if (!pharmacyStationPanelOpen) openPharmacyStationPanel();
            });
        }
        var closeBtn = document.getElementById('pharmacy-station-close');
        if (closeBtn) closeBtn.addEventListener('click', closePharmacyStationPanel);
        var ingFilter = document.getElementById('pharmacy-ingredient-filter');
        if (ingFilter && !ingFilter._pharmacyFilterBound) {
            ingFilter._pharmacyFilterBound = true;
            ingFilter.addEventListener('input', function () {
                if (pharmacyStationPanelOpen) renderPharmacyStationPanel();
            });
        }
        var clearBtn = document.getElementById('pharmacy-clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', function () { if (!pharmacyStationPanelOpen) return; setPharmacyInputs([]); renderPharmacyStationPanel(); });
        var fuelMb = document.getElementById('pharmacy-modal-add-fuel-btn');
        if (fuelMb && !fuelMb._pharmacySrvBound) {
            fuelMb._pharmacySrvBound = true;
            fuelMb.addEventListener('click', function () {
                if (!pharmacyStationPanelOpen) return;
                var fk = pharmacyStationUiState.selected_fuel_slot_key ? String(pharmacyStationUiState.selected_fuel_slot_key) : '';
                if (!fk) {
                    showMsg(ui('pharmacy.add_fuel.pick_first'), 'info');
                    return;
                }
                var pf = parsePharmacyResourceSlotKey(fk);
                if (!pf) {
                    showMsg(ui('pharmacy.add_fuel.pick_first'), 'info');
                    return;
                }
                onAddFuelClick({ containerType: pf.containerType, index: pf.index });
                renderPharmacyStationPanel();
                if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
                if (window.SceneRenderer) window.SceneRenderer.render();
            });
        }
        var addAccessoryBtn = document.getElementById('pharmacy-add-accessory-btn');
        if (addAccessoryBtn) {
            addAccessoryBtn.addEventListener('click', function () {
                if (!pharmacyStationPanelOpen) return;
                var sel = document.getElementById('pharmacy-add-accessory');
                var aid = sel && sel.value ? String(sel.value) : '';
                if (!aid) return;
                var ret = installPharmacyAccessoryFromInventory(aid);
                if (!ret || !ret.ok) {
                    showMsg(ui('pharmacy.accessory.install_fail', { item: getItemDisplayNameSafe(aid) }), 'warn');
                    renderPharmacyStationPanel();
                    return;
                }
                showMsg(ui('pharmacy.accessory.install_ok', { item: getItemDisplayNameSafe(aid) }), 'success');
                renderPharmacyStationPanel();
                if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
                if (window.SceneRenderer) window.SceneRenderer.render();
            });
        }
        var startBtn = document.getElementById('pharmacy-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', function () {
                if (!pharmacyStationPanelOpen) return;
                var mid = pharmacyStationUiState.method_id ? String(pharmacyStationUiState.method_id) : '';
                var inputs = normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
                var res = tryPharmacyAtStation(mid, inputs);
                if (!res || res.ok !== true) {
                    var key = pharmacyStartReasonToMsgKey(res ? res.reason : 'unknown');
                    var vars = {};
                    if (res && res.item_id) vars.item = getItemDisplayNameSafe(res.item_id);
                    if (res && res.method_id) vars.method = String(res.method_id);
                    if (res && res.required_accessory_item_id) vars.accessory = getItemDisplayNameSafe(res.required_accessory_item_id);
                    if (res && res.need != null && res.current != null) { vars.need = res.need; vars.cur = res.current; }
                    showMsg(ui(key, vars), 'warn');
                    renderPharmacyStationPanel();
                    return;
                }
                // tryPharmacyAtStation 成功路径内部已负责 showMsg；这里清空投料便于下一次盲配
                setPharmacyInputs([]);
                renderPharmacyStationPanel();
            });
        }
    })();

    var compostStationPanelOpen = false;
    var compostEventActionDisplayById = {};
    var PLANTING_SKILL_ID = 'life_planting';
    var LEGACY_FARMING_SKILL_ID = 'life_farming';
    var compostStationUiState = {
        mode: 'aerobic',
        staged_inputs: [],
        staged_inoculant_item_id: '',
        logs: []
    };
    var compostWindowActionSlots = {
        best: '',
        mid: '',
        alt: ''
    };

    function getCompostActionDisplay(actionId) {
        var id = String(actionId || '').trim();
        if (!id) return '';
        return String(compostEventActionDisplayById[id] || id);
    }

    function getCompostBatchOrIdle(mode) {
        if (!window.CompostSystem || typeof window.CompostSystem.getBatch !== 'function') return null;
        return window.CompostSystem.getBatch(mode);
    }

    function hasCompostInteractionContext() {
        return !!compostStationPanelOpen;
    }

    function getMountedBreathSkillIdForCompostProficiency() {
        if (!IE || typeof IE.getCombatState !== 'function' || typeof IE.getSkillLevel !== 'function') return '';
        var hubs = IE.getCombatState().hubs || {};
        var breathSkillId = String(hubs.breath || '').trim();
        if (!breathSkillId) return '';
        return IE.getSkillLevel(breathSkillId) >= 1 ? breathSkillId : '';
    }

    function addCompostProficiencyForAction(actionType) {
        if (!IE || typeof IE.incrementSkillMoveUsage !== 'function') return;
        ensureLifePlantingSkillEntry();
        var actionKey = String(actionType || '').trim() || 'compost_action';
        IE.incrementSkillMoveUsage(PLANTING_SKILL_ID, actionKey, 1);
        var mountedBreathSkillId = getMountedBreathSkillIdForCompostProficiency();
        if (mountedBreathSkillId) IE.incrementSkillMoveUsage(mountedBreathSkillId, 'tu_na', 1);
    }

    function ensureLifePlantingSkillEntry() {
        if (!IE || typeof IE.getState !== 'function') return false;
        var st = IE.getState();
        if (!st || typeof st !== 'object') return false;
        if (!st.skills || typeof st.skills !== 'object') st.skills = {};

        var changed = false;
        var planting = st.skills[PLANTING_SKILL_ID];
        var legacy = st.skills[LEGACY_FARMING_SKILL_ID];
        if (!planting || typeof planting !== 'object') {
            if (legacy && typeof legacy === 'object') {
                st.skills[PLANTING_SKILL_ID] = {
                    level: Math.max(1, parseInt(legacy.level, 10) || 1),
                    move_usage: legacy.move_usage && typeof legacy.move_usage === 'object'
                        ? Object.assign({}, legacy.move_usage)
                        : {}
                };
            } else {
                st.skills[PLANTING_SKILL_ID] = { level: 1, move_usage: {} };
            }
            planting = st.skills[PLANTING_SKILL_ID];
            changed = true;
        }
        if ((parseInt(planting.level, 10) || 0) < 1) {
            planting.level = 1;
            changed = true;
        }
        if (!planting.move_usage || typeof planting.move_usage !== 'object') {
            planting.move_usage = {};
            changed = true;
        }
        if (changed) recalcCharacterStatsFromIE();
        return true;
    }

    function getCompostStartGuardState(mode, stagedTotals) {
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var totals = stagedTotals || computeStagedCompostTotals();
        var block = null;
        if (window.CompostSystem && typeof window.CompostSystem.getStartBlockState === 'function') {
            block = window.CompostSystem.getStartBlockState(m);
        } else if (window.CompostSystem && typeof window.CompostSystem.canStartNewBatch === 'function') {
            block = window.CompostSystem.canStartNewBatch(m)
                ? { blocked: false, reason: 'ok' }
                : { blocked: true, reason: 'slot_not_ready' };
        } else {
            block = { blocked: false, reason: 'ok' };
        }
        if (block && block.blocked) return { canStart: false, reason: String(block.reason || 'slot_not_ready') };
        if (!Array.isArray(compostStationUiState.staged_inputs) || compostStationUiState.staged_inputs.length < 2) {
            return { canStart: false, reason: 'insufficient_inputs' };
        }
        if (Number(totals && totals.invalid_main_count || 0) > 0) {
            return { canStart: false, reason: 'invalid_inputs' };
        }
        var inoculantId = String(compostStationUiState.staged_inoculant_item_id || '');
        if (!inoculantId || !isItemAllowedCompostInoculant(inoculantId, m)) {
            return { canStart: false, reason: 'inoculant_required' };
        }
        if (getInventoryCountByItemId(inoculantId) <= getStagedCompostCountForItem(inoculantId)) {
            return { canStart: false, reason: 'inoculant_missing_inventory' };
        }
        return { canStart: true, reason: 'ok' };
    }

    function showCompostStartBlockedHint(reason) {
        var r = String(reason || '');
        var key = 'compost.start.fail';
        if (r === 'output_pending') key = 'compost.start.blocked_output_pending';
        else if (r === 'already_fermenting') key = 'compost.start.blocked_fermenting';
        else if (r === 'insufficient_inputs') key = 'compost.start.blocked_inputs';
        else if (r === 'invalid_inputs') key = 'compost.start.blocked_invalid_inputs';
        else if (r === 'inoculant_required') key = 'compost.start.blocked_inoculant_required';
        else if (r === 'inoculant_missing_inventory') key = 'compost.start.blocked_inoculant_missing_inventory';
        showMsg(ui(key), 'warn');
    }

    function tryCollectCompostToInventory(mode) {
        if (!window.CompostSystem || typeof window.CompostSystem.collect !== 'function' || !IE || typeof IE.putItemIntoDefaultContainer !== 'function') {
            return { ok: false, reason: 'unavailable' };
        }
        var batch = getCompostBatchOrIdle(mode);
        var results = batch && Array.isArray(batch.results) ? batch.results : [];
        if (!results.length) return { ok: false, reason: 'nothing_to_collect' };
        var row = results[0] || {};
        var itemId = String(row.item_id || '');
        var left = Math.max(0, Math.floor(Number(row.count) || 0));
        if (!itemId || left <= 0) return { ok: false, reason: 'nothing_to_collect' };
        var wantAll = mode !== 'anaerobic';
        var tryCount = wantAll ? left : left;
        var canPut = 0;
        function rollbackInserted(itemId, n) {
            for (var t = 0; t < n; t++) {
                var s = findFirstContainerSlotByItemId(itemId);
                if (!s) break;
                IE.takeItemFromContainer(s.containerType, s.index);
            }
        }
        for (var i = 0; i < tryCount; i++) {
            var placedTry = IE.putItemIntoDefaultContainer({ item_id: itemId, count: 1, quality_tier: 0 });
            if (!placedTry || !placedTry.placed) break;
            canPut += 1;
        }
        if (canPut <= 0) return { ok: false, reason: 'inventory_full' };
        var takeCount = wantAll ? left : canPut;
        if (wantAll && canPut < left) {
            // 回滚刚才试探放入的数量，避免“好氧全收取”变成偷偷部分收取。
            rollbackInserted(itemId, canPut);
            return { ok: false, reason: 'inventory_full' };
        }
        var ret = window.CompostSystem.collect(mode, takeCount);
        if (!ret || !ret.ok) {
            rollbackInserted(itemId, canPut);
            return { ok: false, reason: ret && ret.reason ? ret.reason : 'collect_failed' };
        }
        return {
            ok: true,
            item_id: ret.item_id,
            collected: ret.count,
            remaining_in_batch: Math.max(0, Number(ret.remaining_in_batch) || 0),
            partial: Number(ret.remaining_in_batch) > 0
        };
    }

    function isItemAllowedCompostIngredient(itemId) {
        if (!IE || typeof IE.getItemTemplate !== 'function') return false;
        var tpl = IE.getItemTemplate(itemId);
        if (window.CompostSystem && typeof window.CompostSystem.isTemplateEligibleMainMaterial === 'function') {
            return !!window.CompostSystem.isTemplateEligibleMainMaterial(tpl);
        }
        if (!tpl || typeof tpl !== 'object') return false;
        var hasC = Object.prototype.hasOwnProperty.call(tpl, 'fert_c');
        var hasN = Object.prototype.hasOwnProperty.call(tpl, 'fert_n');
        return hasC || hasN;
    }

    function isItemAllowedCompostInoculant(itemId, mode) {
        if (!IE || typeof IE.getItemTemplate !== 'function') return false;
        var tpl = IE.getItemTemplate(itemId);
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        if (window.CompostSystem && typeof window.CompostSystem.isTemplateEligibleInoculant === 'function') {
            return !!window.CompostSystem.isTemplateEligibleInoculant(tpl, m);
        }
        if (!tpl || typeof tpl !== 'object') return false;
        return m === 'anaerobic' ? (tpl.compost_inoculant_anaerobic === true) : (tpl.compost_inoculant_aerobic === true);
    }

    function getCompostInoculantOptionsFromInventory(mode) {
        if (!IE) return [];
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var seen = {};
        var out = [];
        var groups = [
            IE.getPocketArray ? IE.getPocketArray() : [],
            IE.getVestArray ? IE.getVestArray() : [],
            IE.getBackpackArray ? IE.getBackpackArray() : []
        ];
        for (var g = 0; g < groups.length; g++) {
            var arr = groups[g];
            if (!Array.isArray(arr)) continue;
            for (var i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                var id = String(cell.item_id);
                if (seen[id]) continue;
                if (!isItemAllowedCompostInoculant(id, m)) continue;
                if (getInventoryCountByItemId(id) <= 0) continue;
                seen[id] = true;
                out.push(id);
            }
        }
        out.sort();
        return out;
    }

    function trySetCompostInoculantFromInventory(iid, mode) {
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var id = iid != null ? String(iid) : '';
        if (!id || !isItemAllowedCompostInoculant(id, m)) return;
        var have = getInventoryCountByItemId(id);
        var staged = getStagedCompostCountForItem(id);
        if (have <= staged) return;
        compostStationUiState.staged_inoculant_item_id = id;
        renderCompostStationPanel();
    }

    function getCompostIngredientOptionsFromInventory() {
        if (!IE) return [];
        var seen = {};
        var out = [];
        var groups = [
            IE.getPocketArray ? IE.getPocketArray() : [],
            IE.getVestArray ? IE.getVestArray() : [],
            IE.getBackpackArray ? IE.getBackpackArray() : []
        ];
        for (var g = 0; g < groups.length; g++) {
            var arr = groups[g];
            if (!Array.isArray(arr)) continue;
            for (var i = 0; i < arr.length; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                var id = String(cell.item_id);
                if (seen[id]) continue;
                if (!isItemAllowedCompostIngredient(id)) continue;
                if (getInventoryCountByItemId(id) <= 0) continue;
                seen[id] = true;
                out.push(id);
            }
        }
        out.sort();
        return out;
    }

    function getStagedCompostCountForItem(itemId) {
        var n = 0;
        var arr = Array.isArray(compostStationUiState.staged_inputs) ? compostStationUiState.staged_inputs : [];
        for (var i = 0; i < arr.length; i++) if (String(arr[i]) === String(itemId)) n += 1;
        return n;
    }

    function getReservedCompostCountForItem(itemId, mode) {
        var id = String(itemId || '');
        if (!id) return 0;
        var n = getStagedCompostCountForItem(id);
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var inocId = String(compostStationUiState.staged_inoculant_item_id || '');
        if (inocId && inocId === id && isItemAllowedCompostInoculant(id, m)) n += 1;
        return n;
    }

    function pushCompostLog(text) {
        var line = String(text || '').trim();
        if (!line) return;
        compostStationUiState.logs.push(line);
        if (compostStationUiState.logs.length > 60) compostStationUiState.logs = compostStationUiState.logs.slice(compostStationUiState.logs.length - 60);
    }

    function computeStagedCompostTotals() {
        var arr = Array.isArray(compostStationUiState.staged_inputs) ? compostStationUiState.staged_inputs : [];
        if (window.CompostSystem && typeof window.CompostSystem.computeCnTotalsFromInputItems === 'function') {
            return window.CompostSystem.computeCnTotalsFromInputItems(arr, {
                getTemplate: function (itemId) {
                    return IE && typeof IE.getItemTemplate === 'function' ? IE.getItemTemplate(itemId) : null;
                }
            });
        }
        var cTotal = 0;
        var nTotal = 0;
        for (var i = 0; i < arr.length; i++) {
            var iid = String(arr[i] || '');
            if (!iid) continue;
            var tpl = IE && typeof IE.getItemTemplate === 'function' ? IE.getItemTemplate(iid) : null;
            cTotal += Math.floor(Number(tpl && tpl.fert_c) || 0);
            nTotal += Math.floor(Number(tpl && tpl.fert_n) || 0);
        }
        return { c_total: cTotal, n_total: nTotal, legal_cn: cTotal > 0 && nTotal > 0, ratio: (cTotal > 0 && nTotal > 0) ? (cTotal / nTotal) : null };
    }

    function getCompostPerceptionText(cTotal, nTotal, mode) {
        if (cTotal <= 0 && nTotal <= 0) return { text: ui('compost.perception.empty'), severity: 'neutral', text_key: 'compost.perception.empty' };
        var feedback = null;
        if (window.CompostSystem && typeof window.CompostSystem.classifyCnFeedbackByTotals === 'function') {
            feedback = window.CompostSystem.classifyCnFeedbackByTotals(cTotal, nTotal, mode);
        }
        if (!feedback || !feedback.text_key) {
            var ratio = (nTotal > 0) ? (cTotal / nTotal) : null;
            if (cTotal <= 0 || nTotal <= 0) feedback = { text_key: 'compost.perception.void', severity: 'fatal', ratio: null };
            else if (ratio >= 25 && ratio <= 35) feedback = { text_key: 'compost.perception.good', severity: 'good', ratio: ratio };
            else if ((ratio >= 18 && ratio < 25) || (ratio > 35 && ratio <= 45)) feedback = { text_key: 'compost.perception.mid', severity: 'mid', ratio: ratio };
            else feedback = { text_key: mode === 'anaerobic' ? 'compost.perception.bad_anaerobic' : 'compost.perception.bad_aerobic', severity: 'bad', ratio: ratio };
        }
        return { text: ui(feedback.text_key), severity: String(feedback.severity || 'neutral'), text_key: feedback.text_key };
    }

    function tryAddOneCompostInputFromInventory(iid) {
        if (!compostStationPanelOpen) return;
        iid = iid != null ? String(iid) : '';
        if (!iid || !isItemAllowedCompostIngredient(iid)) return;
        var have = getInventoryCountByItemId(iid);
        var reserved = getReservedCompostCountForItem(iid, compostStationUiState.mode);
        if (reserved >= have) return;
        compostStationUiState.staged_inputs.push(iid);
        renderCompostStationPanel();
    }

    function renderCompostIngredientPickerList() {
        var wrap = document.getElementById('compost-ingredient-list');
        if (!wrap) return;
        wrap.innerHTML = '';
        var opts = getCompostIngredientOptionsFromInventory();
        var oi;
        for (oi = 0; oi < opts.length; oi++) {
            var iid = opts[oi];
            var disp = getItemDisplayNameSafe(iid);
            var have = getInventoryCountByItemId(iid);
            var reserved = getReservedCompostCountForItem(iid, compostStationUiState.mode);
            var canAdd = have > reserved;
            var row = document.createElement('div');
            row.className = 'cs-ingredient-row';
            var left = document.createElement('div');
            left.className = 'cs-ing-left';
            var nameEl = document.createElement('div');
            nameEl.className = 'cs-ing-name';
            nameEl.textContent = disp;
            var idEl = document.createElement('div');
            idEl.className = 'cs-ing-id';
            idEl.textContent = iid;
            left.appendChild(nameEl);
            left.appendChild(idEl);
            var countsEl = document.createElement('div');
            countsEl.className = 'cs-ing-counts';
            countsEl.textContent = ui('compost.ingredient.available_staged_fmt', { have: String(have), staged: String(reserved) });
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-add-ingredient';
            btn.textContent = ui('compost.btn.add_input');
            btn.disabled = !canAdd;
            btn.onclick = (function (xid) {
                return function (ev) {
                    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    tryAddOneCompostInputFromInventory(xid);
                };
            })(iid);
            row.appendChild(left);
            row.appendChild(countsEl);
            row.appendChild(btn);
            wrap.appendChild(row);
        }
        if (!opts.length) wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('compost.ingredient.empty') + '</div>';
    }

    function renderCompostInoculantPickerList(mode) {
        var wrap = document.getElementById('compost-inoculant-list');
        if (!wrap) return;
        var m = mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        var selected = String(compostStationUiState.staged_inoculant_item_id || '');
        if (selected && !isItemAllowedCompostInoculant(selected, m)) {
            selected = '';
            compostStationUiState.staged_inoculant_item_id = '';
        }
        var opts = getCompostInoculantOptionsFromInventory(m);
        wrap.innerHTML = '';
        for (var i = 0; i < opts.length; i++) {
            var iid = opts[i];
            var row = document.createElement('div');
            row.className = 'cs-ingredient-row';
            var left = document.createElement('div');
            left.className = 'cs-ing-left';
            var nameEl = document.createElement('div');
            nameEl.className = 'cs-ing-name';
            nameEl.textContent = getItemDisplayNameSafe(iid);
            var idEl = document.createElement('div');
            idEl.className = 'cs-ing-id';
            idEl.textContent = iid;
            left.appendChild(nameEl);
            left.appendChild(idEl);
            var countsEl = document.createElement('div');
            countsEl.className = 'cs-ing-counts';
            countsEl.textContent = ui('compost.ingredient.available_fmt', { have: String(getInventoryCountByItemId(iid)) });
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-add-ingredient';
            btn.textContent = (selected === iid) ? ui('compost.btn.selected') : ui('compost.btn.select');
            btn.disabled = selected === iid;
            btn.onclick = (function (xid, xm) {
                return function (ev) {
                    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    trySetCompostInoculantFromInventory(xid, xm);
                };
            })(iid, m);
            row.appendChild(left);
            row.appendChild(countsEl);
            row.appendChild(btn);
            wrap.appendChild(row);
        }
        if (!opts.length) wrap.innerHTML = '<div style="color:#a8a29e;font-size:13px;">' + ui('compost.inoculant.empty') + '</div>';
    }

    function renderCompostStationPanel() {
        var modal = document.getElementById('modal-compost-station');
        if (!modal) return;
        var mode = compostStationUiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
        compostStationUiState.mode = mode;
        var batch = getCompostBatchOrIdle(mode);
        var inputWrap = document.getElementById('compost-input-list');
        var perceptionEl = document.getElementById('compost-perception-text');
        var progressWrap = document.getElementById('compost-progress-kv');
        var windowEl = document.getElementById('compost-window-text');
        var resultWrap = document.getElementById('compost-result-list');
        var logWrap = document.getElementById('compost-log-list');
        var tabA = document.getElementById('compost-tab-aerobic');
        var tabN = document.getElementById('compost-tab-anaerobic');
        if (tabA) tabA.classList.toggle('active', mode === 'aerobic');
        if (tabN) tabN.classList.toggle('active', mode === 'anaerobic');

        function getCompostStatusText(statusRaw) {
            var s = String(statusRaw || 'IDLE').trim().toUpperCase();
            if (s === 'FERMENTING') return ui('compost.status.fermenting');
            if (s === 'SETTLED') return ui('compost.status.settled');
            return ui('compost.status.idle');
        }

        if (inputWrap) {
            inputWrap.innerHTML = '';
            if (batch && Array.isArray(batch.materials) && batch.materials.length) {
                for (var mi = 0; mi < batch.materials.length; mi++) {
                    var mat = batch.materials[mi] || {};
                    var r0 = document.createElement('div');
                    r0.className = 'cs-input-row';
                    r0.innerHTML = '<div class="iname">' + getItemDisplayNameSafe(mat.item_id) + ' (' + String(mat.item_id || '') + ')</div><div class="icnt">x' + String(mat.count || 1) + '</div><div></div>';
                    inputWrap.appendChild(r0);
                }
                if (batch.inoculant_item_id) {
                    var inocBatchRow = document.createElement('div');
                    inocBatchRow.className = 'cs-input-row';
                    inocBatchRow.innerHTML = '<div class="iname">' + ui('compost.inoculant.label') + ': ' + getItemDisplayNameSafe(batch.inoculant_item_id) + ' (' + String(batch.inoculant_item_id || '') + ')</div><div class="icnt">x1</div><div></div>';
                    inputWrap.appendChild(inocBatchRow);
                }
            } else if (Array.isArray(compostStationUiState.staged_inputs) && compostStationUiState.staged_inputs.length) {
                var stagedMap = {};
                for (var si = 0; si < compostStationUiState.staged_inputs.length; si++) {
                    var sid = String(compostStationUiState.staged_inputs[si] || '');
                    if (!sid) continue;
                    stagedMap[sid] = (stagedMap[sid] || 0) + 1;
                }
                var keys = Object.keys(stagedMap);
                for (var ki = 0; ki < keys.length; ki++) {
                    var id0 = keys[ki];
                    var row = document.createElement('div');
                    row.className = 'cs-input-row';
                    var name = document.createElement('div');
                    name.className = 'iname';
                    name.textContent = getItemDisplayNameSafe(id0) + ' (' + id0 + ')';
                    var cnt = document.createElement('div');
                    cnt.className = 'icnt';
                    cnt.textContent = 'x' + String(stagedMap[id0]);
                    var btnDel = document.createElement('button');
                    btnDel.type = 'button';
                    btnDel.className = 'btn-mini';
                    btnDel.textContent = ui('compost.btn.remove');
                    btnDel.onclick = (function (rid) {
                        return function () {
                            for (var dx = compostStationUiState.staged_inputs.length - 1; dx >= 0; dx--) {
                                if (String(compostStationUiState.staged_inputs[dx]) === String(rid)) {
                                    compostStationUiState.staged_inputs.splice(dx, 1);
                                    break;
                                }
                            }
                            renderCompostStationPanel();
                        };
                    })(id0);
                    row.appendChild(name);
                    row.appendChild(cnt);
                    row.appendChild(btnDel);
                    inputWrap.appendChild(row);
                }
                if (compostStationUiState.staged_inoculant_item_id) {
                    var inocRow = document.createElement('div');
                    inocRow.className = 'cs-input-row';
                    var inocName = document.createElement('div');
                    inocName.className = 'iname';
                    inocName.textContent = ui('compost.inoculant.label') + ': ' + getItemDisplayNameSafe(compostStationUiState.staged_inoculant_item_id) + ' (' + compostStationUiState.staged_inoculant_item_id + ')';
                    var inocCnt = document.createElement('div');
                    inocCnt.className = 'icnt';
                    inocCnt.textContent = 'x1';
                    var inocDel = document.createElement('button');
                    inocDel.type = 'button';
                    inocDel.className = 'btn-mini';
                    inocDel.textContent = ui('compost.btn.remove');
                    inocDel.onclick = function () {
                        compostStationUiState.staged_inoculant_item_id = '';
                        renderCompostStationPanel();
                    };
                    inocRow.appendChild(inocName);
                    inocRow.appendChild(inocCnt);
                    inocRow.appendChild(inocDel);
                    inputWrap.appendChild(inocRow);
                }
            } else {
                if (compostStationUiState.staged_inoculant_item_id) {
                    var inocOnly = document.createElement('div');
                    inocOnly.className = 'cs-input-row';
                    inocOnly.innerHTML = '<div class="iname">' + ui('compost.inoculant.label') + ': ' + getItemDisplayNameSafe(compostStationUiState.staged_inoculant_item_id) + ' (' + compostStationUiState.staged_inoculant_item_id + ')</div><div class="icnt">x1</div><div></div>';
                    inputWrap.appendChild(inocOnly);
                } else {
                    inputWrap.innerHTML = '<div class="cs-empty-hint">' + ui('compost.inputs.empty') + '</div>';
                }
            }
        }
        renderCompostIngredientPickerList();
        renderCompostInoculantPickerList(mode);

        var totals = computeStagedCompostTotals();
        if (batch && batch.status === 'FERMENTING') totals = { c_total: Number(batch.c_total) || 0, n_total: Number(batch.n_total) || 0 };
        if (perceptionEl) {
            var perception = getCompostPerceptionText(totals.c_total, totals.n_total, mode);
            perceptionEl.textContent = perception.text;
            perceptionEl.setAttribute('data-severity', perception.severity || 'neutral');
        }

        if (progressWrap) {
            progressWrap.innerHTML = '';
            var age = batch ? (Number(batch.age_ticks) || 0) : 0;
            var duration = batch ? (Number(batch.duration_ticks) || 0) : 0;
            var stat = getCompostStatusText(batch ? batch.status : 'IDLE');
            var kv1 = document.createElement('div'); kv1.className = 'kv'; kv1.textContent = ui('compost.kv.status', { status: stat });
            var kv2 = document.createElement('div'); kv2.className = 'kv'; kv2.textContent = ui('compost.kv.tick', { cur: age, max: duration });
            progressWrap.appendChild(kv1); progressWrap.appendChild(kv2);
        }

        var pendingWindow = null;
        var windowInteractState = null;
        if (window.CompostSystem && typeof window.CompostSystem.getWindowInteractionState === 'function') {
            windowInteractState = window.CompostSystem.getWindowInteractionState(mode);
            if (windowInteractState && windowInteractState.can_interact) {
                pendingWindow = windowInteractState.pending_window || null;
            }
        } else if (batch && Array.isArray(batch.windows) && Number(batch.pending_window_index) >= 0) {
            pendingWindow = batch.windows[Number(batch.pending_window_index)] || null;
        }
        if (windowEl) {
            if (pendingWindow && batch && batch.status === 'FERMENTING') {
                var evt = pendingWindow.event || {};
                var vEvt = evt.variant || {};
                var evtTitle = String(vEvt.title || evt.title || evt.event_id || 'window');
                var evtDesc = String(vEvt.desc || evt.desc || '').trim();
                windowEl.textContent = ui('compost.window.pending', { title: evtTitle }) + (evtDesc ? ('\n' + evtDesc) : '');
            } else if (windowInteractState && windowInteractState.reason === 'illegal_cn_batch') {
                windowEl.textContent = ui('compost.window.disabled_illegal');
            } else {
                windowEl.textContent = ui('compost.window.none');
            }
        }

        var bestBtn = document.getElementById('compost-interact-best-btn');
        var midBtn = document.getElementById('compost-interact-mid-btn');
        var altBtn = document.getElementById('compost-interact-alt-btn');
        var canInteract = !!(batch && batch.status === 'FERMENTING' && pendingWindow);
        var pEvt = (pendingWindow && pendingWindow.event) ? pendingWindow.event : {};
        var isAerobicWindow = canInteract && mode === 'aerobic';
        var btnSlots = [
            { key: 'best', el: bestBtn },
            { key: 'mid', el: midBtn },
            { key: 'alt', el: altBtn }
        ];
        compostWindowActionSlots.best = '';
        compostWindowActionSlots.mid = '';
        compostWindowActionSlots.alt = '';
        var actionChoices = [];
        if (canInteract) {
            if (isAerobicWindow) {
                if (String(pEvt.best_action || '').trim()) actionChoices.push({ id: String(pEvt.best_action || '').trim() });
                if (String(pEvt.secondary_action || '').trim()) actionChoices.push({ id: String(pEvt.secondary_action || '').trim() });
                if (String(pEvt.bad_action || '').trim()) actionChoices.push({ id: String(pEvt.bad_action || '').trim() });
                // 固定种子洗牌：同一事件窗顺序稳定，但不同事件窗会变化。
                var seedSrc = String(pEvt.event_id || '') + '|' + String(pendingWindow && pendingWindow.index || 0) + '|' + String(pendingWindow && pendingWindow.trigger_tick || 0);
                var seed = 0;
                for (var sx = 0; sx < seedSrc.length; sx++) seed = (((seed * 131) + seedSrc.charCodeAt(sx)) >>> 0);
                function seededRand() { seed = ((seed * 1664525 + 1013904223) >>> 0); return seed / 4294967296; }
                for (var sh = actionChoices.length - 1; sh > 0; sh--) {
                    var j = Math.floor(seededRand() * (sh + 1));
                    var tmp = actionChoices[sh];
                    actionChoices[sh] = actionChoices[j];
                    actionChoices[j] = tmp;
                }
            } else {
                actionChoices.push({ id: 'vent_gas' }, { id: 'leave_as_is' });
            }
        }
        for (var bi = 0; bi < btnSlots.length; bi++) {
            var slot = btnSlots[bi];
            if (!slot.el) continue;
            var ch = actionChoices[bi] || null;
            if (!canInteract || !ch || !ch.id) {
                slot.el.disabled = true;
                slot.el.style.display = 'none';
                slot.el.textContent = '';
                compostWindowActionSlots[slot.key] = '';
            } else {
                slot.el.disabled = false;
                slot.el.style.display = '';
                slot.el.textContent = getCompostActionDisplay(ch.id);
                compostWindowActionSlots[slot.key] = String(ch.id);
            }
        }

        if (resultWrap) {
            resultWrap.innerHTML = '';
            var results = batch && Array.isArray(batch.results) ? batch.results : [];
            if (!results.length) {
                resultWrap.innerHTML = '<div class="cs-empty-hint">' + ui('compost.results.empty') + '</div>';
            } else {
                for (var ri = 0; ri < results.length; ri++) {
                    var r = results[ri] || {};
                    var rowR = document.createElement('div');
                    rowR.className = 'cs-input-row';
                    rowR.innerHTML = '<div class="iname">' + getItemDisplayNameSafe(r.item_id) + ' (' + String(r.item_id || '') + ')</div><div class="icnt">x' + String(r.count || 0) + '</div><div></div>';
                    resultWrap.appendChild(rowR);
                }
            }
        }
        if (logWrap) {
            logWrap.innerHTML = '';
            var logs = compostStationUiState.logs.slice(-20);
            if (!logs.length) {
                logWrap.innerHTML = '<div class="line">' + ui('compost.log.empty') + '</div>';
            } else {
                for (var li = 0; li < logs.length; li++) {
                    var l = document.createElement('div');
                    l.className = 'line';
                    l.textContent = logs[li];
                    logWrap.appendChild(l);
                }
            }
        }

        var startBtn = document.getElementById('compost-start-btn');
        var stopBtn = document.getElementById('compost-stop-btn');
        var collectBtn = document.getElementById('compost-collect-btn');
        var discardBtn = document.getElementById('compost-discard-btn');
        var stagedTotals = computeStagedCompostTotals();
        var startGuard = getCompostStartGuardState(mode, stagedTotals);
        var canStart = !!startGuard.canStart;
        if (startBtn) startBtn.disabled = !canStart;
        if (stopBtn) stopBtn.disabled = !(batch && batch.status === 'FERMENTING');
        if (collectBtn) collectBtn.disabled = !(batch && batch.status === 'SETTLED' && Array.isArray(batch.results) && batch.results.length > 0);
        if (discardBtn) discardBtn.disabled = !(batch && batch.status === 'SETTLED');

        if (window.UIText && typeof window.UIText.applyDom === 'function') {
            try { window.UIText.applyDom(modal); } catch (eApplyCompost) { /* ignore */ }
        }
    }

    function openCompostStationPanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (guardPlayerComaBlocked()) return;
        if (compostStationPanelOpen) return;
        if (!isOnCompostStationTile()) {
            showMsg(ui('compost.station.not_on_tile'), 'info');
            return;
        }
        ensureLifePlantingSkillEntry();
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        compostStationPanelOpen = true;
        var modal = document.getElementById('modal-compost-station');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        renderCompostStationPanel();
        render();
    }

    function closeCompostStationPanel() {
        if (!compostStationPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        compostStationPanelOpen = false;
        var modal = document.getElementById('modal-compost-station');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        render();
    }

    (function bindCompostStationPanel() {
        var tabA = document.getElementById('compost-tab-aerobic');
        var tabN = document.getElementById('compost-tab-anaerobic');
        if (tabA) tabA.addEventListener('click', function () { compostStationUiState.mode = 'aerobic'; renderCompostStationPanel(); });
        if (tabN) tabN.addEventListener('click', function () { compostStationUiState.mode = 'anaerobic'; renderCompostStationPanel(); });
        var closeBtn = document.getElementById('compost-station-close');
        if (closeBtn) closeBtn.addEventListener('click', closeCompostStationPanel);

        var startBtn = document.getElementById('compost-start-btn');
        if (startBtn) startBtn.addEventListener('click', function () {
            if (!hasCompostInteractionContext() || !window.CompostSystem) return;
            var mode = compostStationUiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var startGuard = getCompostStartGuardState(mode, null);
            if (!startGuard.canStart) {
                showCompostStartBlockedHint(startGuard.reason);
                return;
            }
            var mats = {};
            for (var i = 0; i < compostStationUiState.staged_inputs.length; i++) {
                var id = String(compostStationUiState.staged_inputs[i] || '');
                if (!id) continue;
                mats[id] = (mats[id] || 0) + 1;
            }
            var list = [];
            var keys = Object.keys(mats);
            for (var k = 0; k < keys.length; k++) {
                var iid = keys[k];
                var cnt = mats[iid];
                list.push({ item_id: iid, count: cnt });
            }
            var totals = window.CompostSystem && typeof window.CompostSystem.computeCnTotalsFromInputItems === 'function'
                ? window.CompostSystem.computeCnTotalsFromInputItems(list, {
                    getTemplate: function (itemId) {
                        return IE && typeof IE.getItemTemplate === 'function' ? IE.getItemTemplate(itemId) : null;
                    }
                })
                : { c_total: 0, n_total: 0 };
            var consumed = [];
            for (var x = 0; x < compostStationUiState.staged_inputs.length; x++) {
                var sid = String(compostStationUiState.staged_inputs[x] || '');
                var slot = findFirstContainerSlotByItemId(sid);
                if (!slot) continue;
                var taken = IE.takeItemFromContainer(slot.containerType, slot.index);
                if (taken && taken.success && taken.item) consumed.push(taken.item);
            }
            var inoculantId = String(compostStationUiState.staged_inoculant_item_id || '');
            var inocTaken = null;
            if (inoculantId) {
                var inocSlot = findFirstContainerSlotByItemId(inoculantId);
                if (!inocSlot) {
                    putItemsBack(consumed);
                    showCompostStartBlockedHint('inoculant_missing_inventory');
                    return;
                }
                var inocTake = IE.takeItemFromContainer(inocSlot.containerType, inocSlot.index);
                if (!inocTake || !inocTake.success || !inocTake.item) {
                    putItemsBack(consumed);
                    showCompostStartBlockedHint('inoculant_missing_inventory');
                    return;
                }
                inocTaken = inocTake.item;
            }
            var ret = window.CompostSystem.startBatch(mode, {
                materials: list,
                c_total: totals.c_total,
                n_total: totals.n_total,
                inoculant_item_id: inoculantId || null
            });
            if (!ret || ret.ok !== true) {
                if (inocTaken) putItemsBack([inocTaken]);
                putItemsBack(consumed);
                showCompostStartBlockedHint(ret && ret.reason ? ret.reason : 'slot_not_ready');
                return;
            }
            compostStationUiState.staged_inputs = [];
            compostStationUiState.staged_inoculant_item_id = '';
            pushCompostLog(ui('compost.log.started', { mode: mode === 'anaerobic' ? ui('compost.tab.anaerobic') : ui('compost.tab.aerobic') }));
            showMsg(ui('compost.start.ok'), 'success');
            renderCompostStationPanel();
            if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
            if (window.SceneRenderer) window.SceneRenderer.render();
        });

        var stopBtn = document.getElementById('compost-stop-btn');
        if (stopBtn) stopBtn.addEventListener('click', function () {
            if (!compostStationPanelOpen || !window.CompostSystem || typeof window.CompostSystem.forceTerminate !== 'function') return;
            var mode = compostStationUiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var ret = window.CompostSystem.forceTerminate(mode, 'forced_by_player');
            if (ret && ret.ok) pushCompostLog(ui('compost.log.stopped'));
            renderCompostStationPanel();
        });

        function interactWithWindow(slotKey) {
            if (!compostStationPanelOpen || !window.CompostSystem || typeof window.CompostSystem.interact !== 'function') return;
            var mode = compostStationUiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var batch = getCompostBatchOrIdle(mode);
            if (!batch || batch.status !== 'FERMENTING' || Number(batch.pending_window_index) < 0) return;
            var actionId = String(compostWindowActionSlots[slotKey] || '');
            if (!actionId) return;
            var ret = window.CompostSystem.interact(mode, actionId, { advance_world_tick: true });
            if (ret && ret.ok) {
                pushCompostLog(ui(ret.success ? 'compost.log.interact_ok' : 'compost.log.interact_fail'));
                if (window.Survival && typeof window.Survival.addDirtyness === 'function') {
                    window.Survival.addDirtyness(10);
                }
            }
            renderCompostStationPanel();
        }

        var bestBtn = document.getElementById('compost-interact-best-btn');
        if (bestBtn) bestBtn.addEventListener('click', function () { interactWithWindow('best'); });
        var midBtn = document.getElementById('compost-interact-mid-btn');
        if (midBtn) midBtn.addEventListener('click', function () { interactWithWindow('mid'); });
        var altBtn = document.getElementById('compost-interact-alt-btn');
        if (altBtn) altBtn.addEventListener('click', function () { interactWithWindow('alt'); });

        var collectBtn = document.getElementById('compost-collect-btn');
        if (collectBtn) collectBtn.addEventListener('click', function () {
            if (!hasCompostInteractionContext()) {
                showMsg(ui('compost.collect.require_station_context'), 'warn');
                return;
            }
            var mode = compostStationUiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var ret = tryCollectCompostToInventory(mode);
            if (!ret || !ret.ok) {
                if (ret && ret.reason === 'inventory_full') {
                    showMsg(ui('compost.collect.inventory_full'), 'warn');
                }
                return;
            }
            pushCompostLog(ui('compost.log.collected', { item: getItemDisplayNameSafe(ret.item_id), count: ret.collected }));
            if (ret.partial) showMsg(ui('compost.collect.partial_left', { left: ret.remaining_in_batch }), 'info');
            renderCompostStationPanel();
            if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
            if (window.SceneRenderer) window.SceneRenderer.render();
        });

        var discardBtn = document.getElementById('compost-discard-btn');
        if (discardBtn) discardBtn.addEventListener('click', function () {
            if (!hasCompostInteractionContext() || !window.CompostSystem || typeof window.CompostSystem.discard !== 'function') {
                showMsg(ui('compost.collect.require_station_context'), 'warn');
                return;
            }
            var mode = compostStationUiState.mode === 'anaerobic' ? 'anaerobic' : 'aerobic';
            var ret = window.CompostSystem.discard(mode);
            if (ret && ret.ok) pushCompostLog(ui('compost.log.discarded'));
            renderCompostStationPanel();
        });
    })();

    (function () {
        var btn = document.getElementById('btn-reset-demo-save');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var ok = window.confirm(ui('confirm.reset.demo'));
            if (!ok) return;
            try {
                if (window.SaveSystem && typeof window.SaveSystem.clearAllLocalProgress === 'function') {
                    window.SaveSystem.clearAllLocalProgress();
                } else {
                    localStorage.removeItem('cabi_realtime_save_v1');
                    localStorage.removeItem('cabi_demo_flags_v1');
                    localStorage.removeItem('cabi_demo_triggered_entries_v1');
                }
            } catch (e) { /* ignore */ }
            try { window.location.reload(); } catch (e2) { /* ignore */ }
        });
    })();
    if (document.getElementById('backpack-panel-close')) {
        document.getElementById('backpack-panel-close').addEventListener('click', closeBackpackPanel);
    }

    var baseWarehousePanelOpen = false;

    function buildBaseWarehouseList(filterStr) {
        var el = document.getElementById('base-warehouse-list');
        if (!el) return;
        var IE = window.InventoryEquipment;
        if (!IE || typeof IE.getAllItemIds !== 'function') {
            el.textContent = '';
            return;
        }
        var ids = IE.getAllItemIds();
        var f = (filterStr || '').trim().toLowerCase();
        var char0 = IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        var frag = document.createDocumentFragment();
        var i;
        for (i = 0; i < ids.length; i++) {
            var id = ids[i];
            var tpl = IE.getItemTemplate(id);
            var tier = IE.getItemDisplayTier ? IE.getItemDisplayTier(id, char0) : 0;
            var disp = tpl && IE.getDisplayName ? IE.getDisplayName(tpl, tier, char0) : id;
            if (f) {
                if (String(id).toLowerCase().indexOf(f) < 0 && String(disp).toLowerCase().indexOf(f) < 0) continue;
            }
            var row = document.createElement('div');
            row.className = 'warehouse-item-row';
            var nameEl = document.createElement('div');
            nameEl.className = 'wname';
            nameEl.textContent = disp;
            var idEl = document.createElement('div');
            idEl.className = 'wid';
            idEl.textContent = id;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-take-one';
            btn.setAttribute('data-item-id', id);
            btn.textContent = ui('warehouse.take.one');
            if (tpl) {
                var tipHtml = buildItemTooltipHtmlForTemplate(id, tpl, null, char0);
                row.addEventListener('mouseenter', function (h, elRef) { return function () { showItemTooltip(h, elRef); }; }(tipHtml, row));
                row.addEventListener('mouseleave', hideItemTooltip);
            }
            row.appendChild(nameEl);
            row.appendChild(idEl);
            row.appendChild(btn);
            frag.appendChild(row);
        }
        el.innerHTML = '';
        el.appendChild(frag);
    }

    function takeFromBaseWarehouse(itemId) {
        var IE = window.InventoryEquipment;
        if (!IE || !itemId) return;
        var tpl = IE.getItemTemplate(itemId);
        if (!tpl) return;
        var r = IE.putItemIntoDefaultContainer({ item_id: itemId, count: 1, quality_tier: 0 });
        var char0 = IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        var tier0 = IE.getItemDisplayTier ? IE.getItemDisplayTier(itemId, char0) : 0;
        var dispName = tpl && IE.getDisplayName ? IE.getDisplayName(tpl, tier0, char0) : itemId;
        if (r.placed) {
            showMsg(ui('warehouse.take.ok', { name: dispName }), 'success');
        } else {
            showMsg(ui('warehouse.take.fail'), 'warn');
        }
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        if (typeof updateBackpackPanel === 'function') updateBackpackPanel();
        render();
    }

    function openBaseWarehousePanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (!isAdjacentToWarehouseTile()) {
            showMsg('需要站在仓库旁边才能打开仓库。', 'info');
            return;
        }
        if (baseWarehousePanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        baseWarehousePanelOpen = true;
        var modal = document.getElementById('modal-base-warehouse');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        var filterEl = document.getElementById('base-warehouse-filter');
        if (filterEl) filterEl.value = '';
        buildBaseWarehouseList('');
        if (window.UIText && typeof window.UIText.applyDom === 'function') {
            var mw = document.getElementById('modal-base-warehouse');
            if (mw) window.UIText.applyDom(mw);
        }
        render();
    }

    function closeBaseWarehousePanel() {
        if (!baseWarehousePanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        baseWarehousePanelOpen = false;
        var modal = document.getElementById('modal-base-warehouse');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        render();
    }

    (function bindBaseWarehouse() {
        var abw = document.getElementById('action-bar-warehouse');
        if (abw) {
            abw.addEventListener('click', function () {
                if (baseWarehousePanelOpen) closeBaseWarehousePanel(); else openBaseWarehousePanel();
            });
        }
        var cl = document.getElementById('base-warehouse-close');
        if (cl) cl.addEventListener('click', closeBaseWarehousePanel);
        var listEl = document.getElementById('base-warehouse-list');
        if (listEl) {
            listEl.addEventListener('click', function (ev) {
                var t = ev.target;
                if (!t || !t.closest) return;
                var btn = t.closest('.btn-take-one');
                if (!btn) return;
                var iid = btn.getAttribute('data-item-id');
                if (iid) takeFromBaseWarehouse(iid);
            });
        }
        var fe = document.getElementById('base-warehouse-filter');
        if (fe) {
            fe.addEventListener('input', function () {
                if (!baseWarehousePanelOpen) return;
                buildBaseWarehouseList(fe.value || '');
                if (window.UIText && typeof window.UIText.applyDom === 'function') {
                    var mw = document.getElementById('modal-base-warehouse');
                    if (mw) window.UIText.applyDom(mw);
                }
            });
        }
    })();

    var combatPanelOpen = false;
    var combatUIState = {
        mode: 'skills',
        curCat: 'unarmed',
        curSkillId: null,
        curPart: 'rhand',
        curSlot: 'active',
        editingSlot: null,
        curAcupointCat: 'du',
        curAcupointId: null,
        acupointPage: 0,
        recipeSchemaListOpen: false
    };

    function getRecipeSchemaValidationReport() {
        var rep = window.SceneCtx && window.SceneCtx.recipe_schema_validation_report;
        if (!rep || typeof rep !== 'object') return { errors: [], warnings: [] };
        return {
            errors: Array.isArray(rep.errors) ? rep.errors : [],
            warnings: Array.isArray(rep.warnings) ? rep.warnings : []
        };
    }

    function renderRecipeSchemaValidationDebugList() {
        var btn = document.getElementById('btn-debug-recipe-schema-errors');
        var panel = document.getElementById('recipe-schema-debug-panel');
        var list = document.getElementById('recipe-schema-debug-list');
        var empty = document.getElementById('recipe-schema-debug-empty');
        if (!btn || !panel || !list || !empty) return;

        var rep = getRecipeSchemaValidationReport();
        var rows = rep.errors;
        if (!rows.length) {
            btn.style.display = 'none';
            panel.classList.remove('show');
            list.innerHTML = '';
            empty.textContent = ui('debug.recipe_schema.empty');
            return;
        }

        btn.style.display = '';
        btn.textContent = ui('debug.recipe_schema.btn', { count: rows.length });
        panel.classList.toggle('show', !!combatUIState.recipeSchemaListOpen);
        list.innerHTML = '';
        empty.style.display = rows.length ? 'none' : '';

        rows.forEach(function (row) {
            var item = document.createElement('div');
            item.className = 'recipe-schema-debug-row';
            var entryType = row && row.entry_type != null ? String(row.entry_type) : '';
            var id = row && row.id != null ? String(row.id) : '';
            var code = row && row.error_code != null ? String(row.error_code) : '';
            var msg = row && row.message != null ? String(row.message) : '';
            item.innerHTML =
                '<div class="col entry-type">' + entryType.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
                '<div class="col entry-id">' + id.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
                '<div class="col error-code">' + code.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
                '<div class="col message">' + msg.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
            list.appendChild(item);
        });
    }
    var LIMB_LABELS = { lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };
    var LIMB_ICONS = { lhand: '🤚', rhand: '🤚', lfoot: '👣', rfoot: '👣' };

    var survivalPanelOpen = false;
    var acupointPanelOpen = false;
    var savePanelOpen = false;
    var currentSkillOverviewTab = 'survival';

    /** 生活技能展示表：与 docs/design/11-skills.md §8.2 一致；id 与已落地的 life_* 前缀对齐。 */
    var LIFE_SKILL_TABLE = [
        { id: 'life_fishing', nameKey: 'life.skill.fishing.name', descKey: 'life.skill.fishing.desc' },
        { id: 'life_mining', nameKey: 'life.skill.mining.name', descKey: 'life.skill.mining.desc' },
        { id: 'life_logging', nameKey: 'life.skill.logging.name', descKey: 'life.skill.logging.desc' },
        { id: 'life_hunting', nameKey: 'life.skill.hunting.name', descKey: 'life.skill.hunting.desc' },
        { id: 'life_gathering', nameKey: 'life.skill.gathering.name', descKey: 'life.skill.gathering.desc' },
        { id: 'life_planting', nameKey: 'life.skill.planting.name', descKey: 'life.skill.planting.desc' },
        { id: 'life_animal_husbandry', nameKey: 'life.skill.animal_husbandry.name', descKey: 'life.skill.animal_husbandry.desc' },
        { id: 'life_cooking', nameKey: 'life.skill.cooking.name', descKey: 'life.skill.cooking.desc' },
        { id: 'life_forging', nameKey: 'life.skill.forging.name', descKey: 'life.skill.forging.desc' },
        { id: 'life_pharmacy', nameKey: 'life.skill.pharmacy.name', descKey: 'life.skill.pharmacy.desc' },
        { id: 'life_weaving', nameKey: 'life.skill.weaving.name', descKey: 'life.skill.weaving.desc' },
        { id: 'life_manufacturing', nameKey: 'life.skill.manufacturing.name', descKey: 'life.skill.manufacturing.desc' },
        { id: 'life_enchant', nameKey: 'life.skill.enchant.name', descKey: 'life.skill.enchant.desc' },
        { id: 'life_trade', nameKey: 'life.skill.trade.name', descKey: 'life.skill.trade.desc' },
        { id: 'life_appraisal', nameKey: 'life.skill.appraisal.name', descKey: 'life.skill.appraisal.desc' }
    ];

    function getSaveCredentials() {
        var accEl = document.getElementById('save-input-account');
        var pwEl = document.getElementById('save-input-password');
        return {
            account: accEl && accEl.value ? String(accEl.value).trim() : '',
            password: pwEl && pwEl.value ? String(pwEl.value) : ''
        };
    }

    function openSavePanel() {
        if (savePanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        savePanelOpen = true;
        var modal = document.getElementById('modal-save');
        if (modal) modal.classList.add('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '0.1';
            left.style.pointerEvents = 'none';
        }
    }

    function closeSavePanel() {
        if (!savePanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        savePanelOpen = false;
        var modal = document.getElementById('modal-save');
        if (modal) modal.classList.remove('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '';
            left.style.pointerEvents = '';
        }
        render();
    }

    function openCombatPanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (combatPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        combatPanelOpen = true;
        refreshRenderProfile();
        var firstCat = window.CombatSkills && window.CombatSkills.getCategories().length ? window.CombatSkills.getCategories()[0].id : 'unarmed';
        combatUIState.curCat = firstCat;
        var skillsInCat = window.CombatSkills ? window.CombatSkills.getSkillsByCategory(firstCat) : [];
        combatUIState.curSkillId = (skillsInCat.length && skillsInCat[0].id) ? skillsInCat[0].id : null;
        combatUIState.curPart = 'rhand';
        combatUIState.curSlot = 'active';
        combatUIState.editingSlot = null;
        combatUIState.mode = 'skills';
        document.getElementById('modal-combat').classList.add('show');
        document.getElementById('left-hud').style.opacity = '0.1';
        document.getElementById('left-hud').style.pointerEvents = 'none';
        renderCombatModal();
    }

    function closeCombatPanel() {
        if (!combatPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        combatPanelOpen = false;
        refreshRenderProfile();
        document.getElementById('modal-combat').classList.remove('show');
        document.getElementById('left-hud').style.opacity = '';
        document.getElementById('left-hud').style.pointerEvents = '';
        document.getElementById('picker-move').classList.remove('show');
        var postPicker = document.getElementById('picker-post-effect');
        if (postPicker) postPicker.classList.remove('show');
        combatUIState.editingSlot = null;
        render();
    }

    function getCombatSkillName(skillId) {
        if (!skillId) return ui('combat.empty');
        var sk = window.CombatSkills && window.CombatSkills.getSkill(skillId);
        return (sk && sk.name) ? sk.name : skillId;
    }

    function buildDefaultMoveSequenceArray(CS, IE, skillId, limbId) {
        if (!CS || !IE || !skillId) return [];
        limbId = limbId || 'lhand';
        if (typeof CS.buildDefaultMoveSequenceForLimb === 'function') {
            return CS.buildDefaultMoveSequenceForLimb(skillId, limbId, IE.getSkillLevel(skillId));
        }
        var lv = IE.getSkillLevel(skillId);
        var maxSlots = CS.getMaxSlotsForLevel(skillId, lv);
        var unlocked = CS.getUnlockedMoves(skillId, lv);
        var out = [];
        var i;
        for (i = 0; i < maxSlots; i++) {
            if (unlocked[i]) out.push(unlocked[i].id);
            else if (unlocked[0]) out.push(unlocked[0].id);
            else out.push('');
        }
        return out;
    }

    function safeSetCombatState(patch, failMsg) {
        if (!IE || typeof IE.setCombatState !== 'function') return false;
        try {
            var ok = IE.setCombatState(patch);
            if (ok === false) {
                showMsg(failMsg || '战斗配置不合法，已拒绝保存。', 'warn');
                return false;
            }
            return true;
        } catch (e) {
            showMsg((failMsg || '战斗配置不合法，已拒绝保存。') + (e && e.message ? (' ' + e.message) : ''), 'warn');
            return false;
        }
    }

    /**
     * 地图近战：按 limb_strike_order + cursor 顺序扫描选肢；招式来自该肢 move_sequences 轮询。
     * ctxMeta 同时给出 skill_id、limb_id、move_id 时不抽样、不推进光标。
     */
    function pickWorldMeleeAttackIntent(ctxMeta) {
        ctxMeta = ctxMeta || {};
        var out = { skillId: 'combat_basic_unarmed', moveId: null, limbId: 'lhand', advanceCursor: false };
        var IE = window.InventoryEquipment;
        var CS = window.CombatSkills;
        if (ctxMeta.skill_id != null && ctxMeta.limb_id != null && ctxMeta.move_id != null) {
            out.skillId = ctxMeta.skill_id;
            out.limbId = ctxMeta.limb_id;
            out.moveId = ctxMeta.move_id;
            out.advanceCursor = false;
            return out;
        }
        if (!IE || !CS || typeof IE.getCombatState !== 'function') return out;
        var cmb = IE.getCombatState();
        var LIMB_IDS = IE.COMBAT_LIMB_IDS || ['lhand', 'rhand', 'lfoot', 'rfoot'];
        var LIMB_LABEL_KEYS = { lhand: 'body.part.lhand', rhand: 'body.part.rhand', lfoot: 'body.part.lfoot', rfoot: 'body.part.rfoot' };

        function limbLabel(lid) {
            return ui(LIMB_LABEL_KEYS[lid] || lid);
        }

        function displaySkillName(skillId) {
            var sk0 = CS.getSkill(skillId);
            return (sk0 && sk0.name) ? sk0.name : String(skillId || '');
        }
        function displayMoveName(skillId, moveId) {
            if (!moveId) return '';
            var sk0 = CS.getSkill(skillId);
            if (!sk0 || !Array.isArray(sk0.moves)) return String(moveId);
            var mmi;
            for (mmi = 0; mmi < sk0.moves.length; mmi++) {
                var mvo = sk0.moves[mmi];
                if (mvo && mvo.id === moveId) return mvo.name || String(moveId);
            }
            return String(moveId);
        }

        function firstValidMoveForLimb(lid, skillId) {
            var pk = typeof IE.peekMoveIdForLimb === 'function' ? IE.peekMoveIdForLimb(lid) : null;
            var lv = IE.getSkillLevel(skillId);
            var un = CS.getUnlockedMoves(skillId, lv);
            var limbKeys = typeof window.getLimbActionTags === 'function' ? window.getLimbActionTags(lid) : [];
            if (typeof CS.moveAllowedOnLimbByTagKeys !== 'function') {
                var ids = {};
                var u;
                for (u = 0; u < un.length; u++) ids[un[u].id] = 1;
                if (pk && ids[pk]) return pk;
                return un.length ? un[0].id : null;
            }
            function moveOk(moveId) {
                if (!moveId) return false;
                var mi;
                for (mi = 0; mi < un.length; mi++) {
                    if (un[mi].id === moveId) return CS.moveAllowedOnLimbByTagKeys(un[mi], limbKeys);
                }
                return false;
            }
            if (pk && moveOk(pk)) return pk;
            var ui;
            for (ui = 0; ui < un.length; ui++) {
                if (CS.moveAllowedOnLimbByTagKeys(un[ui], limbKeys)) return un[ui].id;
            }
            return null;
        }

        var orderedLimbs = (typeof IE.getLimbStrikeOrderSlice === 'function')
            ? IE.getLimbStrikeOrderSlice()
            : ((typeof IE.getLimbStrikeOrder === 'function') ? IE.getLimbStrikeOrder() : LIMB_IDS.slice());
        if (!Array.isArray(orderedLimbs) || !orderedLimbs.length) orderedLimbs = LIMB_IDS.slice();
        var rawCursor = (typeof IE.getLimbStrikeOrderCursor === 'function') ? IE.getLimbStrikeOrderCursor() : 0;
        var cursor = Math.floor(Number(rawCursor) || 0);
        cursor = ((cursor % orderedLimbs.length) + orderedLimbs.length) % orderedLimbs.length;
        var scanOrder = [];
        var si;
        for (si = 0; si < orderedLimbs.length; si++) {
            scanOrder.push(orderedLimbs[(cursor + si) % orderedLimbs.length]);
        }

        var candidates = [];
        var li;
        for (li = 0; li < scanOrder.length; li++) {
            var lid = scanOrder[li];
            var limb = cmb.limbs && cmb.limbs[lid];
            if (!limb || !limb.active) continue;
            var sk = CS.getSkill(limb.active);
            if (!sk || (sk.category !== 'unarmed' && sk.category !== 'weapon')) continue;
            var fm = firstValidMoveForLimb(lid, limb.active);
            if (!fm) continue;
            candidates.push({ lid: lid, skillId: limb.active });
        }

        if (!candidates.length) {
            out.limbId = 'lhand';
            out.skillId = (cmb.limbs && cmb.limbs.lhand && cmb.limbs.lhand.active) ? cmb.limbs.lhand.active : 'combat_basic_unarmed';
            var fm0 = firstValidMoveForLimb(out.limbId, out.skillId);
            out.moveId = fm0 || 'jab';
            out.advanceCursor = false;
            if (window.GameLog && typeof window.GameLog.log === 'function') {
                window.GameLog.log(ui('log.combat.resolve.player_offense_skipped'), 'combat');
            }
            return out;
        }

        var picked = candidates[0];
        out.limbId = picked.lid;
        out.skillId = picked.skillId;
        out.moveId = firstValidMoveForLimb(picked.lid, picked.skillId);
        out.advanceCursor = ctxMeta.move_id == null;
        if (out.advanceCursor && typeof IE.advanceLimbStrikeOrderAfterAttack === 'function') {
            IE.advanceLimbStrikeOrderAfterAttack(out.limbId);
        }

        var stepIdx = scanOrder.indexOf(picked.lid);
        if (stepIdx < 0) stepIdx = 0;
        var seqNameParts = [];
        var sqi;
        for (sqi = 0; sqi < orderedLimbs.length; sqi++) {
            seqNameParts.push(limbLabel(orderedLimbs[sqi]));
        }
        var metForbid = ctxMeta && ctxMeta.exchange_parry_limb_ids;
        var parryIdList;
        if (Array.isArray(metForbid) && metForbid.length) {
            parryIdList = metForbid.map(function (x) { return String(x).trim(); }).filter(Boolean);
        } else if (window.SceneCtx) {
            parryIdList = (window.SceneCtx.playerExchangeParryLimbs && window.SceneCtx.playerExchangeParryLimbs.length)
                ? window.SceneCtx.playerExchangeParryLimbs.slice() : [];
        } else {
            parryIdList = [];
        }
        var parryLabelParts = [];
        var pvi;
        for (pvi = 0; pvi < parryIdList.length; pvi++) {
            parryLabelParts.push(limbLabel(parryIdList[pvi]));
        }
        var noneTxt = ui('log.combat.resolve.limb_pick_strike_forbid_empty');
        if (window.GameLog && typeof window.GameLog.log === 'function') {
            window.GameLog.log(ui('log.combat.resolve.limb_pick_strike', {
                seq: seqNameParts.join(' → '),
                seqIds: orderedLimbs.join('、'),
                cursor: String(cursor),
                step: String(stepIdx),
                forbid: parryLabelParts.length ? parryLabelParts.join('、') : noneTxt,
                forbidId: parryIdList.length ? parryIdList.join('、') : noneTxt,
                picked: limbLabel(picked.lid),
                pickedId: String(picked.lid),
                skillLabel: displaySkillName(picked.skillId),
                skillId: String(picked.skillId),
                moveLabel: displayMoveName(picked.skillId, out.moveId),
                moveId: out.moveId != null ? String(out.moveId) : ''
            }), 'combat');
        }
        return out;
    }

    function renderCombatModal() {
        var CS = window.CombatSkills;
        var AP = window.Acupoints;
        var combatState = IE && IE.getCombatState ? IE.getCombatState() : { limbs: {}, hubs: { breath: null, footwork: null }, move_sequences: {}, skill_move_sequences: {}, move_sequence_cursors: {}, post_effect_sequences: {} };
        var limbIds = IE && IE.COMBAT_LIMB_IDS ? IE.COMBAT_LIMB_IDS.slice() : ['lhand', 'rhand', 'lfoot', 'rfoot'];
        var meridianSkillId = (IE && IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID) ? IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID : 'special_meridian_studies';
        var meridianLv = IE && typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel(meridianSkillId) : 0;
        var acupointsUnlocked = meridianLv >= 1;

        var mainTabs = document.querySelectorAll('#modal-combat .combat-main-tab');
        if (!acupointsUnlocked && combatUIState.mode === 'acupoints') combatUIState.mode = 'skills';
        var isAcupointMode = combatUIState.mode === 'acupoints';
        var combatModal = document.getElementById('modal-combat');
        if (combatModal) combatModal.classList.toggle('combat-acupoint-mode', isAcupointMode);

        if (mainTabs && mainTabs.length) {
            mainTabs.forEach(function (btn) {
                var mode = btn.getAttribute('data-mode') || 'skills';
                if (mode === 'acupoints') btn.style.display = acupointsUnlocked ? '' : 'none';
                btn.classList.toggle('active', combatUIState.mode === mode);
                btn.onclick = function () {
                    if (mode === 'acupoints' && !acupointsUnlocked) return;
                    combatUIState.mode = mode;
                    if (mode === 'acupoints') combatUIState.acupointPage = 0;
                    renderCombatModal();
                };
            });
        }

        var catBox = document.getElementById('category-tabs');
        var skillListEl = document.getElementById('skill-list');
        var acListEl = document.getElementById('acupoint-list');

        if (catBox) catBox.innerHTML = '';
        if (skillListEl) {
            skillListEl.style.display = isAcupointMode ? 'none' : 'flex';
            if (!isAcupointMode) skillListEl.innerHTML = '';
        }
        if (acListEl) {
            acListEl.style.display = isAcupointMode ? 'flex' : 'none';
            if (isAcupointMode) acListEl.innerHTML = '';
        }
        var hubSectionEl = document.querySelector('#modal-combat .combat-hub-section');
        var limbTitleEl = document.querySelector('#modal-combat .combat-limb-title');
        var limbContainerEl = document.getElementById('limb-container');
        var seqHeadEl = document.querySelector('#modal-combat .combat-seq-head');
        var selectedMetaEl = document.querySelector('#modal-combat .combat-selected-meta');
        var seqWrapEl = document.getElementById('move-sequence');
        var configColEl = document.querySelector('#modal-combat .combat-config-column');
        if (hubSectionEl) hubSectionEl.style.display = isAcupointMode ? 'none' : '';
        if (limbTitleEl) limbTitleEl.style.display = isAcupointMode ? 'none' : '';
        if (limbContainerEl) limbContainerEl.style.display = isAcupointMode ? 'none' : '';
        if (seqHeadEl) seqHeadEl.style.display = isAcupointMode ? 'none' : '';
        if (selectedMetaEl) selectedMetaEl.style.display = isAcupointMode ? 'none' : '';
        if (seqWrapEl) seqWrapEl.style.display = isAcupointMode ? 'none' : '';
        if (configColEl) configColEl.style.display = isAcupointMode ? 'none' : '';

        if (CS && !isAcupointMode) {
            var cats = CS.getCategories();
            if (catBox) {
                cats.forEach(function (c) {
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'combat-cat-btn' + (combatUIState.curCat === c.id ? ' active' : '');
                    btn.textContent = (c.icon ? c.icon + ' ' : '') + c.label;
                    btn.onclick = function () {
                        combatUIState.curCat = c.id;
                        var list = CS.getSkillsByCategory(c.id);
                        combatUIState.curSkillId = (list.length && list[0]) ? list[0].id : null;
                        renderCombatModal();
                    };
                    catBox.appendChild(btn);
                });
            }

            if (skillListEl) {
                var list = CS.getSkillsByCategory(combatUIState.curCat);
                list.forEach(function (s) {
                    var div = document.createElement('div');
                    div.className = 'combat-skill-item' + (combatUIState.curSkillId === s.id ? ' selected' : '');
                    var level = IE && IE.getSkillLevel ? IE.getSkillLevel(s.id) : 0;
                    var skillsState = IE && IE.getState() && IE.getState().skills ? IE.getState().skills : {};
                    var moveUsage = (skillsState[s.id] && skillsState[s.id].move_usage) ? skillsState[s.id].move_usage : {};
                    var profPct = Math.floor(CS.getSkillTotalProficiency(s.id, moveUsage) * 100);
                    var metaStr = (s.category === 'footwork')
                        ? ui('combat.skill.meta.footwork', { level: level })
                        : ui('combat.skill.meta', { level: level, profPct: profPct });
                    div.innerHTML = '<div class="skill-icon">' + (s.icon || '') + '</div><div class="skill-info"><div class="skill-name">' + (s.name || s.id) + '</div><div class="skill-meta">' + metaStr + '</div></div>';
                    div.onclick = function () {
                        combatUIState.curSkillId = s.id;
                        renderCombatModal();
                    };
                    skillListEl.appendChild(div);
                });
            }
        }

        var hubBreath = document.getElementById('hub-breath');
        var hubFootwork = document.getElementById('hub-footwork');
        var valBreath = document.getElementById('val-breath');
        var valFootwork = document.getElementById('val-footwork');
        if (!isAcupointMode) {
            if (hubBreath) hubBreath.classList.toggle('active', !!combatState.hubs.breath);
            if (hubFootwork) hubFootwork.classList.toggle('active', !!combatState.hubs.footwork);
            if (valBreath) { valBreath.textContent = getCombatSkillName(combatState.hubs.breath) || ui('combat.not.loaded'); valBreath.classList.toggle('empty', !combatState.hubs.breath); }
            if (valFootwork) { valFootwork.textContent = getCombatSkillName(combatState.hubs.footwork) || ui('combat.not.loaded'); valFootwork.classList.toggle('empty', !combatState.hubs.footwork); }
        }

        var limbBox = document.getElementById('limb-container');
        if (!isAcupointMode && limbBox && combatState.limbs) {
            limbBox.innerHTML = '';
            var isGlobal = combatUIState.curCat === 'breath' || combatUIState.curCat === 'footwork';
            limbBox.style.opacity = isGlobal ? '0.2' : '1';
            limbBox.style.pointerEvents = isGlobal ? 'none' : 'auto';
            var strikeOrder = (IE && typeof IE.getLimbStrikeOrderSlice === 'function') ? IE.getLimbStrikeOrderSlice() : limbIds.slice();
            if (!Array.isArray(strikeOrder) || strikeOrder.length !== limbIds.length) strikeOrder = limbIds.slice();
            var strikeCursor = (IE && typeof IE.getLimbStrikeOrderCursor === 'function') ? Number(IE.getLimbStrikeOrderCursor()) : 0;
            if (!isFinite(strikeCursor)) strikeCursor = 0;
            strikeCursor = ((Math.floor(strikeCursor) % strikeOrder.length) + strikeOrder.length) % strikeOrder.length;
            var strikeOrderPos = {};
            strikeOrder.forEach(function (lid, idx) { strikeOrderPos[String(lid)] = idx; });
            var strikeBar = document.createElement('div');
            strikeBar.className = 'combat-strike-order-bar';
            var strikeHead = document.createElement('div');
            strikeHead.className = 'strike-order-head';
            strikeHead.innerHTML = '<span class="strike-order-label">' + ui('combat.strike_order.label') + '</span><span class="strike-order-hint" title="' + ui('combat.strike_order.hint') + '">ⓘ</span>';
            strikeBar.appendChild(strikeHead);
            var strikeChips = document.createElement('div');
            strikeChips.className = 'strike-order-chips';
            strikeOrder.forEach(function (lid, idx) {
                var chip = document.createElement('span');
                chip.className = 'strike-chip' + (idx === strikeCursor ? ' strike-cursor' : '');
                chip.innerHTML = '<span class="strike-chip-order">' + String(idx + 1) + '</span><span class="strike-chip-name">' + ui(LIMB_LABELS[lid] || lid) + '</span>' + (idx === strikeCursor ? '<span class="strike-chip-dot"></span>' : '');
                strikeChips.appendChild(chip);
                if (idx < strikeOrder.length - 1) {
                    var swapBtn = document.createElement('button');
                    swapBtn.type = 'button';
                    swapBtn.className = 'btn-strike-swap';
                    swapBtn.textContent = '↔';
                    swapBtn.title = ui('combat.strike_order.swap_pair');
                    swapBtn.onclick = function (i, j) {
                        return function (e) {
                            e.stopPropagation();
                            if (!IE || typeof IE.swapLimbStrikeOrderIndices !== 'function') return;
                            IE.swapLimbStrikeOrderIndices(i, j);
                            renderCombatModal();
                        };
                    }(idx, idx + 1);
                    strikeChips.appendChild(swapBtn);
                }
            });
            strikeBar.appendChild(strikeChips);
            limbBox.appendChild(strikeBar);
            var selSkillForPost = CS && combatUIState.curSkillId ? CS.getSkill(combatUIState.curSkillId) : null;
            var canEditPost = !!selSkillForPost && combatUIState.curCat !== 'breath' && combatUIState.curCat !== 'footwork';
            var obtainedPostIds = (window.CharacterAttributes && typeof window.CharacterAttributes.getPostEffectsObtainedIds === 'function')
                ? window.CharacterAttributes.getPostEffectsObtainedIds()
                : [];
            function limbHasAnyEquippablePostEffect(lid) {
                if (!window.PostEffects || typeof window.PostEffects.getPostEffect !== 'function') return false;
                var limb = combatState && combatState.limbs ? combatState.limbs[lid] : null;
                var activeSkillId = (limb && limb.active) ? String(limb.active) : '';
                if (!activeSkillId) return false;
                var seq = (combatState && combatState.move_sequences && Array.isArray(combatState.move_sequences[lid]))
                    ? combatState.move_sequences[lid]
                    : [];
                var moveIds = [];
                for (var i = 0; i < seq.length; i++) {
                    var rid = seq[i] ? String(seq[i]) : '';
                    if (!rid) continue;
                    if (rid.indexOf('variant:') === 0) continue;
                    moveIds.push(rid);
                }
                for (var pi = 0; pi < obtainedPostIds.length; pi++) {
                    var pid = obtainedPostIds[pi] ? String(obtainedPostIds[pi]) : '';
                    if (!pid) continue;
                    var pe = window.PostEffects.getPostEffect(pid);
                    if (!pe || !pe.id) continue;
                    if (Array.isArray(pe.valid_skill_ids) && pe.valid_skill_ids.length && pe.valid_skill_ids.indexOf(activeSkillId) < 0) continue;
                    if (Array.isArray(pe.valid_move_ids) && pe.valid_move_ids.length) {
                        var okMove = false;
                        for (var mi = 0; mi < moveIds.length; mi++) {
                            if (pe.valid_move_ids.indexOf(moveIds[mi]) >= 0) { okMove = true; break; }
                        }
                        if (!okMove) continue;
                    }
                    return true;
                }
                return false;
            }
            limbIds.forEach(function (lid) {
                var limb = combatState.limbs[lid] || { active: null, parry: null };
                var div = document.createElement('div');
                div.className = 'combat-limb-item';
                var activeName = getCombatSkillName(limb.active);
                var parryName = getCombatSkillName(limb.parry);
                var isActiveSel = combatUIState.curPart === lid && combatUIState.curSlot === 'active';
                var isParrySel = combatUIState.curPart === lid && combatUIState.curSlot === 'parry';
                var orderBadge = strikeOrderPos[lid] != null ? ('#' + String(Number(strikeOrderPos[lid]) + 1)) : '--';
                div.innerHTML = '<div class="limb-header"><span>' + (LIMB_ICONS[lid] || '') + ' ' + ui(LIMB_LABELS[lid] || lid) + '</span><div class="limb-header-right"><span class="limb-order-badge">' + orderBadge + '</span><span class="limb-post-btn-wrap"></span></div></div><div class="limb-slots"><div class="combat-limb-slot' + (isActiveSel ? ' selected' : '') + '" data-part="' + lid + '" data-slot="active"><span class="slot-type">' + ui('combat.slot.active') + '</span><span class="slot-skill">' + activeName + '</span></div><div class="combat-limb-slot' + (isParrySel ? ' selected' : '') + '" data-part="' + lid + '" data-slot="parry"><span class="slot-type">' + ui('combat.slot.parry') + '</span><span class="slot-skill">' + parryName + '</span></div></div>';

                var btnWrap = div.querySelector('.limb-post-btn-wrap');
                if (btnWrap) {
                    if (limbHasAnyEquippablePostEffect(lid)) {
                        var equippedPostId = getLimbPostEffectId(combatState, lid);
                        var equippedPostName = equippedPostId ? getPostEffectName(equippedPostId) : '';
                        var btnPost = document.createElement('button');
                        btnPost.type = 'button';
                        btnPost.className = 'combat-debug-btn btn-limb-post-effect';
                        btnPost.setAttribute('data-ui', 'combat.post_effect.btn');
                        btnPost.textContent = equippedPostName ? ('后遗症: ' + equippedPostName) : '后遗症';
                        btnPost.disabled = !canEditPost;
                        btnPost.onclick = (function (targetLid, anchorEl) {
                            return function (e) {
                                if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                                if (anchorEl && anchorEl.disabled) return;
                                combatUIState.curPart = targetLid;
                                if (!combatUIState.curSlot) combatUIState.curSlot = 'active';
                                openLimbPostEffectPicker(anchorEl, targetLid);
                            };
                        })(lid, btnPost);
                        btnWrap.appendChild(btnPost);
                    }
                }
                div.querySelectorAll('.combat-limb-slot').forEach(function (slotEl) {
                    slotEl.onclick = function () {
                        combatUIState.curPart = slotEl.getAttribute('data-part');
                        combatUIState.curSlot = slotEl.getAttribute('data-slot');
                        renderCombatModal();
                    };
                });
                limbBox.appendChild(div);
            });
        }

        var selSkill = CS && combatUIState.curSkillId ? CS.getSkill(combatUIState.curSkillId) : null;
        var titleEl = document.getElementById('skill-title');
        var levelEl = document.getElementById('skill-level');
        var profEl = document.getElementById('skill-prof');
        if (titleEl) {
            if (!isAcupointMode) {
                titleEl.textContent = selSkill ? selSkill.name : '--';
            } else if (AP && combatUIState.curAcupointId) {
                var catId = combatUIState.curAcupointCat;
                var listApTitle = AP.getAcupointsByCategory(catId);
                var curAp = listApTitle.find(function (x) { return x.id === combatUIState.curAcupointId; });
                titleEl.textContent = curAp ? curAp.name : '--';
            } else {
                titleEl.textContent = '--';
            }
        }
        var skillLevel = IE && combatUIState.curSkillId ? IE.getSkillLevel(combatUIState.curSkillId) : 0;
        var skillsState = IE && IE.getState() && IE.getState().skills ? IE.getState().skills : {};
        var moveUsage = (combatUIState.curSkillId && skillsState[combatUIState.curSkillId] && skillsState[combatUIState.curSkillId].move_usage) ? skillsState[combatUIState.curSkillId].move_usage : {};
        var profPct = selSkill && CS && selSkill.category !== 'footwork' ? Math.floor(CS.getSkillTotalProficiency(combatUIState.curSkillId, moveUsage) * 100) : 0;
        if (levelEl) levelEl.textContent = ui('combat.level', { v: skillLevel });
        if (profEl) profEl.textContent = (selSkill && selSkill.category === 'footwork') ? ui('combat.prof.not_applicable') : ui('combat.prof.total', { v: profPct });
        renderRecipeSchemaValidationDebugList();

        // Deploy slot validation:
        // - 进攻槽（active）只能放非招架技能
        // - 招架槽（parry）只能放招架技能（only_parry / category=parry）
        var btnDeploy = document.getElementById('btn-deploy-combat');
        if (btnDeploy) {
            var canDeploy = true;
            btnDeploy.textContent = isAcupointMode ? ui('acupoint.btn.unlock') : ui('combat.deploy');
            if (isAcupointMode) {
                canDeploy = !!combatUIState.curAcupointId;
            } else if (combatUIState.curCat !== 'breath' && combatUIState.curCat !== 'footwork') {
                if (!selSkill) {
                    canDeploy = false;
                } else {
                    var skillIsParry = !!(selSkill.only_parry || selSkill.category === 'parry');
                    var slotIsParry = combatUIState.curSlot === 'parry';
                    canDeploy = (skillIsParry === slotIsParry);
                }
            }
            btnDeploy.disabled = !canDeploy;
        }

        function getPostEffectName(postId) {
            if (!postId || !window.PostEffects || typeof window.PostEffects.getPostEffect !== 'function') return '';
            var pe = window.PostEffects.getPostEffect(postId);
            if (!pe) return String(postId);
            if (pe.name_key && window.UIText && typeof window.UIText.t === 'function') return window.UIText.t(pe.name_key);
            return pe.id || String(postId);
        }

        function getLimbPostEffectId(combatState, limbId) {
            if (!combatState || !combatState.post_effect_sequences) return null;
            var v = combatState.post_effect_sequences[limbId];
            if (v == null || v === '') return null;
            return String(v);
        }

        function getVariantName(variantId) {
            if (!variantId || !window.CombatVariants || typeof window.CombatVariants.getVariant !== 'function') return '';
            var v = window.CombatVariants.getVariant(variantId);
            if (!v) return String(variantId);
            if (v.name_key && window.UIText && typeof window.UIText.t === 'function') return window.UIText.t(v.name_key);
            return v.id || v.variant_id || String(variantId);
        }

        function variantScopeAllows(meta, target) {
            var s = String((meta && meta.assist_scope) || 'active_moves');
            if (s === 'both') return true;
            if (target === 'active') return s === 'active_moves';
            if (target === 'parry') return s === 'parry';
            return false;
        }

        function getParryVariantSlotCap(parrySkillId) {
            var lv = IE && parrySkillId ? (IE.getSkillLevel(parrySkillId) || 0) : 0;
            return Math.max(0, Math.min(5, Math.floor(Number(lv) / 200)));
        }

        var seqBox = document.getElementById('move-sequence');
        var limbPartForSeq = combatUIState.curPart || 'lhand';
        var limbRowForSeq = combatState.limbs && combatState.limbs[limbPartForSeq];
        var slotForMoveSeq = combatUIState.curSlot || 'active';
        /** 招式序列以该肢**已部署**的主动技能为准，不要求与左侧技能列表选中的项一致，避免列表与肢上部署不一致时整块序列为空。 */
        var seqSkillId = (slotForMoveSeq === 'active' && limbRowForSeq && limbRowForSeq.active) ? String(limbRowForSeq.active) : null;
        var seqSk = (seqSkillId && CS) ? CS.getSkill(seqSkillId) : null;
        var skillLevelForSeq = (seqSkillId && IE) ? IE.getSkillLevel(seqSkillId) : 0;
        var moveUsageForSeq = (seqSkillId && skillsState[seqSkillId] && skillsState[seqSkillId].move_usage) ? skillsState[seqSkillId].move_usage : {};
        if (!isAcupointMode && seqBox && slotForMoveSeq === 'active' && seqSk && seqSk.moves && seqSk.moves.length && seqSk.category !== 'breath' && seqSk.category !== 'footwork' && seqSk.category !== 'parry' && seqSkillId) {
            seqBox.innerHTML = '';
            var maxSlots = CS.getMaxSlotsForLevel(seqSkillId, skillLevelForSeq);
            var unlocked = CS.getUnlockedMoves(seqSkillId, skillLevelForSeq);
            var seq = (combatState.move_sequences && Array.isArray(combatState.move_sequences[limbPartForSeq])) ? combatState.move_sequences[limbPartForSeq].slice() : [];
            var limbIdForPost = limbPartForSeq;
            var limbPostId = getLimbPostEffectId(combatState, limbIdForPost);
            while (seq.length < maxSlots) seq.push('');
            seq = seq.slice(0, maxSlots);
            for (var i = 0; i < maxSlots; i++) {
                var rawMoveId = seq[i] ? String(seq[i]) : '';
                var isVariantSlot = rawMoveId.indexOf('variant:') === 0;
                var variantIdAtSlot = isVariantSlot ? rawMoveId.slice('variant:'.length) : '';
                var moveObj = null;
                if (rawMoveId && !isVariantSlot) {
                    moveObj = unlocked.find(function (m) { return m.id === rawMoveId; }) || null;
                }
                var moveName = isVariantSlot
                    ? ('[变式] ' + getVariantName(variantIdAtSlot))
                    : (moveObj ? moveObj.name : (rawMoveId ? rawMoveId : ui('combat.seq.slot_empty')));
                var useCount = (moveUsageForSeq && moveObj && moveUsageForSeq[moveObj.id] != null) ? moveUsageForSeq[moveObj.id] : 0;
                var nodeProf = moveObj ? Math.floor(CS.getMoveProficiencyRatio(useCount) * 100) : 0;
                var postText = limbPostId ? getPostEffectName(limbPostId) : (rawMoveId && !isVariantSlot ? '无后遗症' : '—');
                var node = document.createElement('div');
                node.className = 'combat-move-node' + (combatUIState.editingSlot === i ? ' editing' : '') + (!rawMoveId ? ' slot-empty' : '');
                node.innerHTML = '<span class="node-index">' + String(i + 1).padStart(2, '0') + '</span><span class="node-name">' + moveName + '</span><span class="node-prof">' + ui('combat.prof.node', { v: nodeProf }) + '</span><span class="node-post' + (limbPostId ? '' : ' empty') + '">' + postText + '</span>';

                // 成数控件（仅主动招式槽）
                if (rawMoveId && !isVariantSlot && moveObj && IE && typeof IE.getMoveSlotPowerLevel === 'function') {
                    var plStored = IE.getMoveSlotPowerLevel(limbPartForSeq, i);
                    var plMin = moveObj.power_level_min != null ? Number(moveObj.power_level_min) : 1;
                    var plMax = moveObj.power_level_max != null ? Number(moveObj.power_level_max) : 12;
                    var plDef = moveObj.default_power_level != null ? Number(moveObj.default_power_level) : 10;
                    var plShow = plStored != null ? plStored : plDef;
                    var powerCtrl = document.createElement('div');
                    powerCtrl.className = 'node-power-ctrl';
                    var btnMinus = document.createElement('button');
                    btnMinus.type = 'button';
                    btnMinus.className = 'btn-power-step';
                    btnMinus.textContent = '−';
                    btnMinus.disabled = plShow <= plMin;
                    var powerVal = document.createElement('span');
                    powerVal.className = 'node-power-val';
                    powerVal.textContent = plShow + '成';
                    var btnPlus = document.createElement('button');
                    btnPlus.type = 'button';
                    btnPlus.className = 'btn-power-step';
                    btnPlus.textContent = '+';
                    btnPlus.disabled = plShow >= plMax;
                    btnMinus.onclick = function (slotIdx, limbId, cur, min) {
                        return function (e) {
                            e.stopPropagation();
                            if (!IE || typeof IE.setMoveSlotPowerLevel !== 'function') return;
                            IE.setMoveSlotPowerLevel(limbId, slotIdx, Math.max(min, cur - 1));
                            renderCombatModal();
                        };
                    }(i, limbPartForSeq, plShow, plMin);
                    btnPlus.onclick = function (slotIdx, limbId, cur, max) {
                        return function (e) {
                            e.stopPropagation();
                            if (!IE || typeof IE.setMoveSlotPowerLevel !== 'function') return;
                            IE.setMoveSlotPowerLevel(limbId, slotIdx, Math.min(max, cur + 1));
                            renderCombatModal();
                        };
                    }(i, limbPartForSeq, plShow, plMax);
                    powerCtrl.appendChild(btnMinus);
                    powerCtrl.appendChild(powerVal);
                    powerCtrl.appendChild(btnPlus);
                    node.appendChild(powerCtrl);
                }

                // Debug: 一键让该招式熟练度 +10%（用于测试 post-effects）
                var debugBtn = document.createElement('button');
                debugBtn.type = 'button';
                debugBtn.className = 'debug-move-prof-btn';
                debugBtn.textContent = '+10%';
                var thisMoveId = (moveObj && moveObj.id && rawMoveId) ? String(moveObj.id) : '';
                debugBtn.disabled = !thisMoveId;
                debugBtn.onclick = function (skillId, mid, moveTemplate) {
                    return function (e) {
                        e.stopPropagation();
                        if (!skillId || !mid) return;
                        var curLevel = IE.getSkillLevel(skillId);
                        if (curLevel < 1) {
                            var st = IE.getState();
                            if (!st.skills || typeof st.skills !== 'object') st.skills = {};
                            if (!st.skills[skillId] || typeof st.skills[skillId] !== 'object') st.skills[skillId] = { level: 1, move_usage: {} };
                            if (st.skills[skillId].level == null) st.skills[skillId].level = 1;
                            if (!st.skills[skillId].move_usage || typeof st.skills[skillId].move_usage !== 'object') st.skills[skillId].move_usage = {};
                        }

                        var maxU = (moveTemplate && moveTemplate.proficiency_max_uses != null)
                            ? moveTemplate.proficiency_max_uses
                            : (CS && typeof CS.getMoveProficiencyMax === 'function' ? CS.getMoveProficiencyMax() : 50000);
                        var dUses = Math.floor(Number(maxU) * 0.1);
                        if (!isFinite(dUses) || dUses <= 0) dUses = 1;
                        IE.incrementSkillMoveUsage(skillId, mid, dUses);
                        renderCombatModal();
                    };
                }(seqSkillId, thisMoveId, moveObj);
                node.appendChild(debugBtn);
                node.onclick = function (idx, el) {
                    return function (e) {
                        e.stopPropagation();
                        combatUIState.editingSlot = idx;
                        openMovePicker(idx, el);
                        if (typeof requestAnimationFrame === 'function') {
                            requestAnimationFrame(function () { renderCombatModal(); });
                        } else {
                            setTimeout(function () { renderCombatModal(); }, 0);
                        }
                    };
                }(i, node);
                seqBox.appendChild(node);
            }

            // 主动链变式与招式共槽，直接在槽位中编辑，不单独渲染列表。
        } else if (seqBox) {
            seqBox.innerHTML = '';
            // 招架槽下显示招架变式槽
            if (!isAcupointMode && combatUIState.curSlot === 'parry' && limbRowForSeq && limbRowForSeq.parry) {
                var parrySkillIdForLimb = limbRowForSeq.parry;
                var capPv = getParryVariantSlotCap(parrySkillIdForLimb);
                var pWrap = document.createElement('div');
                pWrap.className = 'combat-variant-wrap';
                var pTitle = document.createElement('div');
                pTitle.className = 'combat-variant-title';
                pTitle.textContent = ui('combat.variant.parry.title', { cur: capPv, max: 5 });
                pWrap.appendChild(pTitle);
                if (capPv <= 0) {
                    var hint = document.createElement('div');
                    hint.className = 'picker-empty-hint';
                    hint.textContent = ui('combat.variant.parry.locked_hint');
                    pWrap.appendChild(hint);
                } else {
                    var pSeqWrap = document.createElement('div');
                    pSeqWrap.className = 'combat-move-sequence combat-variant-sequence';
                    var pSeq = (combatState.parry_variant_sequences && Array.isArray(combatState.parry_variant_sequences[limbPartForSeq]))
                        ? combatState.parry_variant_sequences[limbPartForSeq].slice()
                        : [];
                    while (pSeq.length < capPv) pSeq.push(null);
                    pSeq = pSeq.slice(0, capPv);
                    for (var ps = 0; ps < capPv; ps++) {
                        var prow = document.createElement('div');
                        var pvid = pSeq[ps];
                        prow.className = 'combat-move-node' + (pvid ? '' : ' slot-empty');
                        var pname = pvid ? getVariantName(pvid) : ui('combat.seq.slot_empty');
                        prow.innerHTML = '<span class="node-index">' + String(ps + 1).padStart(2, '0') + '</span><span class="node-name">' + pname + '</span>';
                        (function (slotIndex, anchorEl) {
                            prow.onclick = function (e) {
                                e.stopPropagation();
                                openParryVariantPicker(limbPartForSeq, parrySkillIdForLimb, slotIndex, anchorEl);
                            };
                        })(ps, prow);
                        pSeqWrap.appendChild(prow);
                    }
                    pWrap.appendChild(pSeqWrap);
                }
                seqBox.appendChild(pWrap);
            }
        }

        var targetEl = document.getElementById('target-indicator');
        if (targetEl) {
            if (!isAcupointMode) {
                if (combatUIState.curCat === 'breath') targetEl.textContent = ui('combat.target.hub.breath');
                else if (combatUIState.curCat === 'footwork') targetEl.textContent = ui('combat.target.hub.footwork');
                else targetEl.textContent = ui('combat.target.limb', { limb: ui(LIMB_LABELS[combatUIState.curPart] || combatUIState.curPart), slot: ui(combatUIState.curSlot === 'active' ? 'combat.slot.active' : 'combat.slot.parry') });
            } else {
                targetEl.textContent = ui('combat.target.acupoint');
            }
        }

        if (AP && isAcupointMode && catBox && acListEl) {
            var acCats = AP.getCategories();
            if (!combatUIState.curAcupointCat && acCats.length) combatUIState.curAcupointCat = acCats[0].id;
            acCats.forEach(function (c) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'combat-cat-btn' + (combatUIState.curAcupointCat === c.id ? ' active' : '');
                btn.textContent = (c.icon ? c.icon + ' ' : '') + c.label;
                btn.onclick = function () {
                    combatUIState.curAcupointCat = c.id;
                    combatUIState.acupointPage = 0;
                    var listAp2 = AP.getAcupointsByCategory(c.id);
                    combatUIState.curAcupointId = listAp2.length ? listAp2[0].id : null;
                    renderCombatModal();
                };
                catBox.appendChild(btn);
            });

            var listAp = AP.getAcupointsByCategory(combatUIState.curAcupointCat);
            var pageSize = 18;
            var total = listAp.length;
            var maxPage = total ? Math.max(0, Math.ceil(total / pageSize) - 1) : 0;
            if (combatUIState.acupointPage > maxPage) combatUIState.acupointPage = maxPage;
            if (combatUIState.acupointPage < 0) combatUIState.acupointPage = 0;
            var start = combatUIState.acupointPage * pageSize;
            var end = Math.min(start + pageSize, total);

            function unlockAcupointForCombat(acupointId, acupointName) {
                if (!AP || !acupointId) return;
                var changed = AP.unlock(acupointId);
                if (changed && window.GameLog) {
                    window.GameLog.log(ui('log.system.acupoint.unlocked', { id: (acupointName || acupointId) }), 'system');
                }
                if (changed && window.CharacterAttributes && typeof window.CharacterAttributes.recalcCharacterStats === 'function' && window.InventoryEquipment) {
                    window.CharacterAttributes.recalcCharacterStats({
                        getEquipmentState: function () { return window.InventoryEquipment.getState().equipment; },
                        getSkillsState: function () { return window.InventoryEquipment.getState().skills; },
                        getItemTemplate: window.InventoryEquipment.getItemTemplate,
                        getEnchantEntry: window.InventoryEquipment.getEnchantEntry,
                        getStrengthLevel: function () { return window.InventoryEquipment.getSkillLevel('survival_strength'); }
                    });
                }
                if (changed && typeof updateStatusPanel === 'function') updateStatusPanel();
                renderCombatModal();
            }

            for (var i = start; i < end; i++) {
                var a = listAp[i];
                var div = document.createElement('div');
                var isSel = combatUIState.curAcupointId === a.id;
                div.className = 'combat-acupoint-item' + (isSel ? ' selected' : '');
                var isUnlocked = AP.isUnlocked(a.id);
                var meta = ui(isUnlocked ? 'acupoint.meta.unlocked' : 'acupoint.meta.locked', { effects: (a.effectsText || '') });
                div.innerHTML = '<div class="acupoint-name">' + a.name + '</div><div class="acupoint-meta">' + meta + '</div>';
                var unlockBtn = document.createElement('button');
                unlockBtn.type = 'button';
                unlockBtn.className = 'combat-pager-btn';
                unlockBtn.textContent = isUnlocked ? ui('acupoint.btn.unlocked') : ui('acupoint.btn.unlock');
                unlockBtn.disabled = !!isUnlocked;
                unlockBtn.onclick = function (id, name) {
                    return function (e) {
                        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                        unlockAcupointForCombat(id, name);
                    };
                }(a.id, a.name);
                div.appendChild(unlockBtn);
                div.onclick = function (id) {
                    return function () {
                        combatUIState.curAcupointId = id;
                        renderCombatModal();
                    };
                }(a.id);
                acListEl.appendChild(div);
            }

            if (total > pageSize) {
                var pager = document.createElement('div');
                pager.className = 'combat-pager';

                var btnPrev = document.createElement('button');
                btnPrev.type = 'button';
                btnPrev.className = 'combat-pager-btn';
                btnPrev.textContent = ui('pager.prev');
                btnPrev.disabled = combatUIState.acupointPage <= 0;
                if (!btnPrev.disabled) {
                    btnPrev.onclick = function () {
                        combatUIState.acupointPage--;
                        renderCombatModal();
                    };
                }

                var info = document.createElement('span');
                info.textContent = ui('pager.info', { cur: (combatUIState.acupointPage + 1), max: (maxPage + 1), total: total });

                var btnNext = document.createElement('button');
                btnNext.type = 'button';
                btnNext.className = 'combat-pager-btn';
                btnNext.textContent = ui('pager.next');
                btnNext.disabled = combatUIState.acupointPage >= maxPage;
                if (!btnNext.disabled) {
                    btnNext.onclick = function () {
                        combatUIState.acupointPage++;
                        renderCombatModal();
                    };
                }

                pager.appendChild(btnPrev);
                pager.appendChild(info);
                pager.appendChild(btnNext);
                acListEl.appendChild(pager);
            }
        }
    }

    function openMovePicker(idx, anchorEl) {
        var CS = window.CombatSkills;
        var picker = document.getElementById('picker-move');
        var listEl = document.getElementById('picker-list');
        if (!picker || !listEl || !CS) return;
        var part = combatUIState.curPart || 'lhand';
        var combatPre = IE.getCombatState();
        var limbRec = combatPre.limbs && combatPre.limbs[part];
        if (!limbRec || !limbRec.active) {
            showMsg(ui('combat.seq.need_deploy'), 'warn');
            return;
        }
        var pickSkillId = String(limbRec.active);
        var skillLevel = IE ? IE.getSkillLevel(pickSkillId) : 0;
        var unlocked = CS.getUnlockedMoves(pickSkillId, skillLevel);
        var limbKeys = typeof window.getLimbActionTags === 'function' ? window.getLimbActionTags(part) : [];
        var skillsState = IE && IE.getState() && IE.getState().skills ? IE.getState().skills : {};
        var moveUsage = (pickSkillId && skillsState[pickSkillId] && skillsState[pickSkillId].move_usage) ? skillsState[pickSkillId].move_usage : {};
        var CV = window.CombatVariants;
        var tabState = { current: (combatUIState && combatUIState.movePickerTab) ? combatUIState.movePickerTab : 'moves' };
        if (tabState.current !== 'moves' && tabState.current !== 'variants') tabState.current = 'moves';
        var unlockDeps = {
            getSkillLevel: function (sid) { return IE.getSkillLevel(String(sid || '')) || 0; },
            getMoveUsage: function (skid) {
                var s = skillsState[skid];
                return (s && s.move_usage && typeof s.move_usage === 'object') ? s.move_usage : {};
            },
            CombatSkills: CS
        };
        function countFilledMoveSlots(s) {
            var c = 0;
            for (var fi = 0; fi < s.length; fi++) {
                if (s[fi] && String(s[fi]).indexOf('variant:') !== 0) c++;
            }
            return c;
        }
        var seqPreview = (combatPre.move_sequences && Array.isArray(combatPre.move_sequences[part])) ? combatPre.move_sequences[part].slice() : [];
        var maxSlotsPick = CS.getMaxSlotsForLevel(pickSkillId, skillLevel);
        while (seqPreview.length < maxSlotsPick) seqPreview.push('');
        seqPreview = seqPreview.slice(0, maxSlotsPick);
        while (seqPreview.length <= idx) seqPreview.push('');
        var filledPreview = countFilledMoveSlots(seqPreview);
        var canClearSlot = !!(seqPreview[idx] && filledPreview > 1);
        var btnClearSlot = document.createElement('button');
        btnClearSlot.type = 'button';
        btnClearSlot.className = 'picker-move-clear-slot';
        btnClearSlot.textContent = ui('combat.seq.clear_slot');
        btnClearSlot.disabled = !canClearSlot;
        btnClearSlot.title = canClearSlot ? '' : (seqPreview[idx] ? ui('combat.seq.clear_last_forbidden') : ui('combat.seq.already_empty'));
        btnClearSlot.onclick = function () {
            var combat = IE.getCombatState();
            var seq = (combat.move_sequences && Array.isArray(combat.move_sequences[part])) ? combat.move_sequences[part].slice() : [];
            var mx = CS.getMaxSlotsForLevel(pickSkillId, IE.getSkillLevel(pickSkillId));
            while (seq.length < mx) seq.push('');
            seq = seq.slice(0, mx);
            while (seq.length <= idx) seq.push('');
            if (!seq[idx]) {
                showMsg(ui('combat.seq.already_empty'), 'warn');
                return;
            }
            if (countFilledMoveSlots(seq) <= 1) {
                showMsg(ui('combat.seq.clear_last_forbidden'), 'warn');
                return;
            }
            seq[idx] = '';
            var patchMs = {};
            patchMs[part] = seq;
            if (!safeSetCombatState({ move_sequences: patchMs }, ui('combat.seq.clear_last_forbidden'))) return;
            if (IE && typeof IE.setMoveSlotPowerLevel === 'function') IE.setMoveSlotPowerLevel(part, idx, null);
            combatUIState.editingSlot = null;
            combatUIState.movePickerTab = tabState.current;
            picker.classList.remove('show');
            renderCombatModal();
        };
        function buildVariantPicker() {
            if (!CV || typeof CV.getAllVariants !== 'function') return;
            var allVar = CV.getAllVariants() || [];
            allVar.forEach(function (v) {
                if (!v) return;
                var vid = String(v.variant_id || v.id || '');
                if (!vid) return;
                var scope = String(v.assist_scope || 'active_moves');
                if (scope !== 'active_moves' && scope !== 'both') return;
                if (typeof CV.isVariantUnlocked === 'function' && !CV.isVariantUnlocked(v, unlockDeps)) return;
                var token = 'variant:' + vid;
                var isDup = seqPreview.indexOf(token) >= 0;
                var btnV = document.createElement('button');
                btnV.type = 'button';
                btnV.className = 'picker-pick-item';
                var vName = (v.name_key && window.UIText && typeof window.UIText.t === 'function') ? window.UIText.t(v.name_key) : vid;
                btnV.innerHTML = '<span>' + vName + '</span><span class="move-prof">' + ui('combat.variant.badge', {}) + '</span>';
                btnV.disabled = isDup;
                btnV.title = isDup ? ui('combat.variant.dup_limb', {}) : '';
                btnV.onclick = function () {
                    var combat = IE.getCombatState();
                    var seq = (combat.move_sequences && Array.isArray(combat.move_sequences[part])) ? combat.move_sequences[part].slice() : [];
                    var mxSel = CS.getMaxSlotsForLevel(pickSkillId, IE.getSkillLevel(pickSkillId));
                    while (seq.length < mxSel) seq.push('');
                    seq = seq.slice(0, mxSel);
                    while (seq.length <= idx) seq.push('');
                    for (var di = 0; di < seq.length; di++) {
                        if (di !== idx && seq[di] === token) {
                            showMsg(ui('combat.variant.dup_limb'), 'warn');
                            return;
                        }
                    }
                    seq[idx] = token;
                    if (countFilledMoveSlots(seq) < 1) {
                        showMsg(ui('combat.seq.clear_last_forbidden'), 'warn');
                        return;
                    }
                    var patchMs2 = {};
                    patchMs2[part] = seq;
                    if (!safeSetCombatState({ move_sequences: patchMs2 }, ui('combat.seq.clear_last_forbidden'))) return;
                    if (IE && typeof IE.setMoveSlotPowerLevel === 'function') IE.setMoveSlotPowerLevel(part, idx, null);
                    combatUIState.editingSlot = null;
                    combatUIState.movePickerTab = 'variants';
                    picker.classList.remove('show');
                    renderCombatModal();
                };
                listEl.appendChild(btnV);
            });
        }
        function reflowPicker() {
            listEl.innerHTML = '';
            var tabRow = document.createElement('div');
            tabRow.className = 'picker-tab-row';
            var btnTMove = document.createElement('button');
            btnTMove.type = 'button';
            btnTMove.className = 'picker-tab-btn' + (tabState.current === 'moves' ? ' active' : '');
            btnTMove.textContent = ui('picker.move.tab.moves');
            btnTMove.setAttribute('aria-pressed', tabState.current === 'moves' ? 'true' : 'false');
            var btnTVar = document.createElement('button');
            btnTVar.type = 'button';
            btnTVar.className = 'picker-tab-btn' + (tabState.current === 'variants' ? ' active' : '');
            btnTVar.textContent = ui('picker.move.tab.variants');
            btnTVar.setAttribute('aria-pressed', tabState.current === 'variants' ? 'true' : 'false');
            btnTMove.onclick = function (e) {
                e.stopPropagation();
                if (tabState.current === 'moves') return;
                tabState.current = 'moves';
                if (combatUIState) combatUIState.movePickerTab = 'moves';
                reflowPicker();
            };
            btnTVar.onclick = function (e) {
                e.stopPropagation();
                if (tabState.current === 'variants') return;
                tabState.current = 'variants';
                if (combatUIState) combatUIState.movePickerTab = 'variants';
                reflowPicker();
            };
            tabRow.appendChild(btnTMove);
            tabRow.appendChild(btnTVar);
            listEl.appendChild(tabRow);
            listEl.appendChild(btnClearSlot);
            if (tabState.current === 'moves') {
                unlocked.forEach(function (m) {
                    if (typeof CS.moveAllowedOnLimbByTagKeys === 'function' && !CS.moveAllowedOnLimbByTagKeys(m, limbKeys)) return;
                    var count = moveUsage[m.id] != null ? moveUsage[m.id] : 0;
                    var pct = Math.floor(CS.getMoveProficiencyRatio(count) * 100);
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'picker-pick-item';
                    btn.innerHTML = '<span>' + m.name + '</span><span class="move-prof">' + ui('combat.prof.short', { v: pct }) + '</span>';
                    btn.onclick = function () {
                        if (typeof CS.moveAllowedOnLimbByTagKeys === 'function' && !CS.moveAllowedOnLimbByTagKeys(m, limbKeys)) {
                            showMsg(ui('combat.seq.limb_tag_blocked'), 'warn');
                            return;
                        }
                        var combat = IE.getCombatState();
                        var seq = (combat.move_sequences && Array.isArray(combat.move_sequences[part])) ? combat.move_sequences[part].slice() : [];
                        var mxSel = CS.getMaxSlotsForLevel(pickSkillId, IE.getSkillLevel(pickSkillId));
                        while (seq.length < mxSel) seq.push('');
                        seq = seq.slice(0, mxSel);
                        while (seq.length <= idx) seq.push('');
                        seq[idx] = m.id;
                        var patchMs = {};
                        patchMs[part] = seq;
                        if (!safeSetCombatState({ move_sequences: patchMs }, ui('combat.seq.clear_last_forbidden'))) return;
                        if (IE && typeof IE.setMoveSlotPowerLevel === 'function') IE.setMoveSlotPowerLevel(part, idx, null);
                        combatUIState.editingSlot = null;
                        combatUIState.movePickerTab = 'moves';
                        picker.classList.remove('show');
                        renderCombatModal();
                    };
                    listEl.appendChild(btn);
                });
            } else {
                buildVariantPicker();
            }
            if (!listEl.querySelectorAll('.picker-pick-item').length) {
                var emptyHint = document.createElement('div');
                emptyHint.className = 'picker-empty-hint';
                emptyHint.style.padding = '8px 12px';
                emptyHint.style.fontSize = '12px';
                emptyHint.style.color = '#a8a29e';
                emptyHint.textContent = (tabState.current === 'moves') ? ui('combat.seq.no_matching_moves') : ui('picker.move.empty.variants');
                listEl.appendChild(emptyHint);
            }
        }
        reflowPicker();
        if (combatUIState) combatUIState.movePickerTab = tabState.current;
        var rect = anchorEl.getBoundingClientRect();
        picker.style.left = (rect.left) + 'px';
        picker.style.top = (rect.top - 200) + 'px';
        picker.classList.add('show');
    }

    function openParryVariantPicker(limbId, parrySkillId, slotIndex, anchorEl) {
        var picker = document.getElementById('picker-move');
        var listEl = document.getElementById('picker-list');
        if (!picker || !listEl || !IE || !window.CombatVariants || typeof window.CombatVariants.getAllVariants !== 'function') return;
        listEl.innerHTML = '';
        var cap = Math.max(0, Math.min(5, Math.floor((IE.getSkillLevel(parrySkillId) || 0) / 200)));
        if (slotIndex >= cap) return;
        var combat = IE.getCombatState();
        if (!combat.parry_variant_sequences || typeof combat.parry_variant_sequences !== 'object') combat.parry_variant_sequences = {};
        var cur = Array.isArray(combat.parry_variant_sequences[limbId]) ? combat.parry_variant_sequences[limbId].slice() : [];
        while (cur.length < cap) cur.push(null);
        cur = cur.slice(0, cap);

        var btnClear = document.createElement('button');
        btnClear.type = 'button';
        btnClear.textContent = '清空此槽';
        btnClear.disabled = !cur[slotIndex];
        btnClear.onclick = function () {
            var c2 = IE.getCombatState();
            if (!c2.parry_variant_sequences || typeof c2.parry_variant_sequences !== 'object') c2.parry_variant_sequences = {};
            var arr = Array.isArray(c2.parry_variant_sequences[limbId]) ? c2.parry_variant_sequences[limbId].slice() : [];
            while (arr.length < cap) arr.push(null);
            arr = arr.slice(0, cap);
            arr[slotIndex] = null;
            c2.parry_variant_sequences[limbId] = arr;
            if (!safeSetCombatState({ parry_variant_sequences: c2.parry_variant_sequences }, '招架变式保存失败。')) return;
            picker.classList.remove('show');
            renderCombatModal();
        };
        listEl.appendChild(btnClear);

        var all = window.CombatVariants.getAllVariants() || [];
        var CVp = window.CombatVariants;
        var skillsSt = IE.getState() && IE.getState().skills ? IE.getState().skills : {};
        var unlockDepsP = {
            getSkillLevel: function (sid) { return IE.getSkillLevel(String(sid || '')) || 0; },
            getMoveUsage: function (skid) {
                var s = skillsSt[skid];
                return (s && s.move_usage && typeof s.move_usage === 'object') ? s.move_usage : {};
            },
            CombatSkills: window.CombatSkills
        };
        var added = 0;
        all.forEach(function (v) {
            if (!v) return;
            var id = String(v.variant_id || v.id || '');
            if (!id) return;
            var scope = String(v.assist_scope || 'active_moves');
            if (scope !== 'parry' && scope !== 'both') return;
            if (CVp && typeof CVp.isVariantUnlocked === 'function' && !CVp.isVariantUnlocked(v, unlockDepsP)) return;
            var duplicate = false;
            for (var i = 0; i < cur.length; i++) {
                if (i === slotIndex) continue;
                if (cur[i] === id) { duplicate = true; break; }
            }
            var btn = document.createElement('button');
            btn.type = 'button';
            var nm = (v.name_key && window.UIText && typeof window.UIText.t === 'function') ? window.UIText.t(v.name_key) : id;
            btn.textContent = nm + (duplicate ? '（同肢已存在）' : '');
            btn.disabled = duplicate;
            btn.onclick = function () {
                var c2 = IE.getCombatState();
                if (!c2.parry_variant_sequences || typeof c2.parry_variant_sequences !== 'object') c2.parry_variant_sequences = {};
                var arr = Array.isArray(c2.parry_variant_sequences[limbId]) ? c2.parry_variant_sequences[limbId].slice() : [];
                while (arr.length < cap) arr.push(null);
                arr = arr.slice(0, cap);
                arr[slotIndex] = id;
                c2.parry_variant_sequences[limbId] = arr;
                if (!safeSetCombatState({ parry_variant_sequences: c2.parry_variant_sequences }, '招架变式保存失败。')) return;
                picker.classList.remove('show');
                renderCombatModal();
            };
            listEl.appendChild(btn);
            added++;
        });
        if (!added) {
            var hint = document.createElement('div');
            hint.className = 'picker-empty-hint';
            hint.style.padding = '8px 12px';
            hint.style.fontSize = '12px';
            hint.style.color = '#a8a29e';
            hint.textContent = '没有可装配的招架变式';
            listEl.appendChild(hint);
        }
        var rect = anchorEl.getBoundingClientRect();
        picker.style.left = (rect.left) + 'px';
        picker.style.top = (rect.top - 200) + 'px';
        picker.classList.add('show');
    }

    function openLimbPostEffectPicker(anchorEl, limbId) {
        var picker = document.getElementById('picker-post-effect');
        var listEl = document.getElementById('picker-post-effect-list');
        if (!picker || !listEl || !limbId || !IE) return;
        listEl.innerHTML = '';

        var obtainedIds = (window.CharacterAttributes && typeof window.CharacterAttributes.getPostEffectsObtainedIds === 'function')
            ? window.CharacterAttributes.getPostEffectsObtainedIds()
            : [];
        var allPost = (window.PostEffects && typeof window.PostEffects.getAllPostEffects === 'function')
            ? window.PostEffects.getAllPostEffects()
            : [];
        var combat = IE.getCombatState ? IE.getCombatState() : null;
        if (!combat) return;
        if (!combat.post_effect_sequences || typeof combat.post_effect_sequences !== 'object') combat.post_effect_sequences = {};
        var curPostId = combat.post_effect_sequences[limbId] ? String(combat.post_effect_sequences[limbId]) : null;
        var limbActiveSkillId = combat.limbs && combat.limbs[limbId] && combat.limbs[limbId].active ? String(combat.limbs[limbId].active) : '';
        var socketMoveIds = [];
        var seq = (combat.move_sequences && Array.isArray(combat.move_sequences[limbId])) ? combat.move_sequences[limbId] : [];
        for (var mi = 0; mi < seq.length; mi++) {
            var rid = seq[mi] ? String(seq[mi]) : '';
            if (!rid) continue;
            if (rid.indexOf('variant:') === 0) continue;
            socketMoveIds.push(rid);
        }

        function escapePickerHtml(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function addOption(label, desc, onClick) {
            var btn = document.createElement('button');
            btn.type = 'button';
            var lab = escapePickerHtml(label);
            var d = desc ? escapePickerHtml(desc) : '';
            btn.innerHTML = '<span>' + lab + '</span>' + (d ? ('<span class="post-desc">' + d + '</span>') : '');
            btn.onclick = onClick;
            listEl.appendChild(btn);
        }

        addOption('清空槽位', '移除当前装配', function () {
            combat.post_effect_sequences[limbId] = null;
            if (!safeSetCombatState({ post_effect_sequences: combat.post_effect_sequences }, '后遗症保存失败。')) return;
            picker.classList.remove('show');
            renderCombatModal();
        });

        var hasAny = false;
        for (var ai = 0; ai < allPost.length; ai++) {
            var pe = allPost[ai];
            if (!pe || !pe.id) continue;
            if (obtainedIds.indexOf(pe.id) < 0) continue;
            if (!limbActiveSkillId) continue;
            if (Array.isArray(pe.valid_skill_ids) && pe.valid_skill_ids.length && pe.valid_skill_ids.indexOf(limbActiveSkillId) < 0) continue;
            if (Array.isArray(pe.valid_move_ids) && pe.valid_move_ids.length) {
                var okMove = false;
                for (var mj = 0; mj < socketMoveIds.length; mj++) {
                    if (pe.valid_move_ids.indexOf(socketMoveIds[mj]) >= 0) { okMove = true; break; }
                }
                if (!okMove) continue;
            }
            hasAny = true;
            var name = pe.name_key && window.UIText && typeof window.UIText.t === 'function' ? window.UIText.t(pe.name_key) : pe.id;
            var desc = pe.desc_key && window.UIText && typeof window.UIText.t === 'function' ? window.UIText.t(pe.desc_key) : '';
            addOption(name, desc, (function (postId) {
                return function () {
                    if (curPostId && curPostId === postId) {
                        picker.classList.remove('show');
                        return;
                    }
                    combat.post_effect_sequences[limbId] = postId;
                    if (!safeSetCombatState({ post_effect_sequences: combat.post_effect_sequences }, '后遗症保存失败。')) return;
                    picker.classList.remove('show');
                    renderCombatModal();
                };
            })(pe.id));
        }

        if (!hasAny) {
            addOption('暂无可装后遗症', '先通过熟练度解锁并满足该招式可装配限制', function () {});
            listEl.lastChild.disabled = true;
        }

        var rect = anchorEl.getBoundingClientRect();
        picker.style.left = (rect.left) + 'px';
        picker.style.top = (rect.top - 260) + 'px';
        picker.classList.add('show');
    }

    function handleDeployCombat() {
        var CS = window.CombatSkills;
        var AP = window.Acupoints;

        if (combatUIState.mode === 'acupoints') {
            if (!AP || !combatUIState.curAcupointId) return;
            var changed = AP.unlock(combatUIState.curAcupointId);
            if (changed && window.GameLog) {
                window.GameLog.log(ui('log.system.acupoint.unlocked', { id: combatUIState.curAcupointId }), 'system');
            }
            if (changed && window.CharacterAttributes && typeof window.CharacterAttributes.recalcCharacterStats === 'function' && window.InventoryEquipment) {
                window.CharacterAttributes.recalcCharacterStats({
                    getEquipmentState: function () { return window.InventoryEquipment.getState().equipment; },
                    getSkillsState: function () { return window.InventoryEquipment.getState().skills; },
                    getItemTemplate: window.InventoryEquipment.getItemTemplate,
                    getEnchantEntry: window.InventoryEquipment.getEnchantEntry,
                    getStrengthLevel: function () { return window.InventoryEquipment.getSkillLevel('survival_strength'); }
                });
            }
            if (changed && typeof updateStatusPanel === 'function') updateStatusPanel();
            renderCombatModal();
            return;
        }

        var skillId = combatUIState.curSkillId;
        if (!skillId || !IE || !IE.setCombatState) return;
        var sk = CS && CS.getSkill(skillId);
        if (!sk) return;
        var combat = IE.getCombatState();
        if (combatUIState.curCat === 'breath') {
            combat.hubs.breath = skillId;
            if (!safeSetCombatState({ hubs: { breath: skillId } }, '内息核心装配失败。')) return;
        } else if (combatUIState.curCat === 'footwork') {
            combat.hubs.footwork = skillId;
            if (!safeSetCombatState({ hubs: { footwork: skillId } }, '步法核心装配失败。')) return;
        } else {
            var slotIsParry = combatUIState.curSlot === 'parry';
            var skillIsParry = !!(sk.only_parry || sk.category === 'parry');
            if (slotIsParry !== skillIsParry) {
                showMsg(slotIsParry ? '该槽位只能装配招架技能。' : '招架技能不能装配到进攻槽位。', 'warn');
                return;
            }
            var part = combatUIState.curPart;
            var prevActive = combat.limbs[part] && combat.limbs[part].active;
            combat.limbs[part][combatUIState.curSlot] = skillId;
            var deployPatch = { limbs: combat.limbs };
            if (!slotIsParry && prevActive !== skillId) {
                var freshSeq = buildDefaultMoveSequenceArray(CS, IE, skillId, part);
                var ms = {};
                ms[part] = freshSeq;
                deployPatch.move_sequences = ms;
                var mc = {};
                mc[part] = 0;
                deployPatch.move_sequence_cursors = mc;
            }
            if (!safeSetCombatState(deployPatch, '技能装配失败。')) return;
        }
        if (window.GameLog) window.GameLog.log(ui('log.system.combat.deployed', { name: (sk.name || skillId) }), 'system');
        renderCombatModal();
    }

    if (document.getElementById('btn-combat')) {
        document.getElementById('btn-combat').addEventListener('click', function () {
            if (combatPanelOpen) closeCombatPanel(); else openCombatPanel();
        });
    }
    if (document.getElementById('combat-modal-close')) {
        document.getElementById('combat-modal-close').addEventListener('click', closeCombatPanel);
    }
    if (document.getElementById('btn-deploy-combat')) {
        document.getElementById('btn-deploy-combat').addEventListener('click', handleDeployCombat);
    }
    if (document.getElementById('btn-debug-combat-skill-plus50')) {
        document.getElementById('btn-debug-combat-skill-plus50').addEventListener('click', function () {
            var skillId = combatUIState.curSkillId;
            if (!skillId || !IE || typeof IE.getState !== 'function') return;
            var st = IE.getState();
            if (!st.skills || typeof st.skills !== 'object') st.skills = {};
            if (!st.skills[skillId] || typeof st.skills[skillId] !== 'object') st.skills[skillId] = { level: 0, move_usage: {} };

            var curLv = IE.getSkillLevel(skillId);
            var nextLv = Math.max(0, parseInt(curLv, 10) || 0) + 50;
            if (window.CombatSkills && typeof window.CombatSkills.getProgressionSkillMaxLevel === 'function') {
                var cap = window.CombatSkills.getProgressionSkillMaxLevel(st, skillId);
                if (isFinite(cap)) nextLv = Math.min(nextLv, Math.max(0, parseInt(cap, 10) || 0));
            }
            st.skills[skillId].level = nextLv;
            if (!st.skills[skillId].move_usage || typeof st.skills[skillId].move_usage !== 'object') st.skills[skillId].move_usage = {};
            if (window.GameLog) {
                window.GameLog.log(ui('log.debug.proficiency.skill_level', {
                    skillId: String(skillId),
                    before: String(curLv),
                    after: String(nextLv),
                    delta: String(nextLv - curLv)
                }), 'system');
            }

            if (window.CharacterAttributes && typeof window.CharacterAttributes.recalcCharacterStats === 'function') {
                window.CharacterAttributes.recalcCharacterStats({
                    getEquipmentState: function () { return IE.getState().equipment; },
                    getSkillsState: function () { return IE.getState().skills; },
                    getItemTemplate: IE.getItemTemplate,
                    getEnchantEntry: IE.getEnchantEntry,
                    getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
                });
            }
            if (typeof updateStatusPanel === 'function') updateStatusPanel();
            if (combatPanelOpen) refreshRenderProfile();
            renderCombatModal();
        });
    }
    if (document.getElementById('btn-debug-recipe-schema-errors')) {
        document.getElementById('btn-debug-recipe-schema-errors').addEventListener('click', function () {
            combatUIState.recipeSchemaListOpen = !combatUIState.recipeSchemaListOpen;
            renderRecipeSchemaValidationDebugList();
        });
    }
    var attrExpDebugToggle = document.getElementById('status-attr-exp-debug-toggle');
    if (attrExpDebugToggle) {
        attrExpDebugToggle.addEventListener('change', function (ev) {
            var enabled = !!(ev && ev.target && ev.target.checked);
            if (window.CharacterAttributes && typeof window.CharacterAttributes.setAttributeExpDebugEnabled === 'function') {
                window.CharacterAttributes.setAttributeExpDebugEnabled(enabled);
            }
            setAttrExpDebugEnabledToStorage(enabled);
        });
    }
    if (window.CharacterAttributes && typeof window.CharacterAttributes.setAttributeExpDebugEnabled === 'function') {
        window.CharacterAttributes.setAttributeExpDebugEnabled(getAttrExpDebugEnabledFromStorage());
    }
    ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'].forEach(function (attrId) {
        var btn = document.getElementById('status-attr-exp-debug-plus-' + attrId);
        if (!btn) return;
        btn.addEventListener('click', function () {
            var CA = window.CharacterAttributes;
            if (!CA || typeof CA.grantAttributeExp !== 'function') return;
            var res = CA.grantAttributeExp('player', [{ attr_id: attrId, exp: 50000 }], { source: 'status_attr_exp_debug_button' });
            if (window.GameLog && res && Array.isArray(res.applied) && res.applied.length > 0) {
                window.GameLog.log('[调试] 属性经验 +' + String(res.applied[0].exp_applied) + ' → ' + String(attrId), 'system');
            }
            if (typeof updateStatusPanel === 'function') updateStatusPanel();
        });
    });
    document.addEventListener('click', function () {
        var hadOpenPicker = false;
        var movePickerAny = document.getElementById('picker-move');
        var postPickerAny = document.getElementById('picker-post-effect');
        if (movePickerAny && movePickerAny.classList.contains('show')) hadOpenPicker = true;
        if (postPickerAny && postPickerAny.classList.contains('show')) hadOpenPicker = true;
        if (combatUIState.editingSlot != null) {
            combatUIState.editingSlot = null;
            var picker = document.getElementById('picker-move');
            if (picker) picker.classList.remove('show');
            var postPicker = document.getElementById('picker-post-effect');
            if (postPicker) postPicker.classList.remove('show');
            if (combatPanelOpen) renderCombatModal();
            return;
        }
        if (hadOpenPicker) {
            if (movePickerAny) movePickerAny.classList.remove('show');
            if (postPickerAny) postPickerAny.classList.remove('show');
        }
    });

    /** 通用：给指定技能 id 加等级；触发属性重算与 UI 刷新。 */
    function addSkillLevelGeneric(skillId, plus, opts) {
        var IE = window.InventoryEquipment;
        if (!IE || typeof IE.getState !== 'function' || !skillId) return;
        var st = IE.getState();
        if (!st.skills || typeof st.skills !== 'object') st.skills = {};
        if (!st.skills[skillId] || typeof st.skills[skillId] !== 'object') st.skills[skillId] = { level: 0, move_usage: {} };
        var before = Math.max(0, parseInt(st.skills[skillId].level, 10) || 0);
        var delta = Math.max(1, parseInt(plus, 10) || 1);
        st.skills[skillId].level = before + delta;
        if (!st.skills[skillId].move_usage || typeof st.skills[skillId].move_usage !== 'object') st.skills[skillId].move_usage = {};
        if (opts && opts.gameLog && window.GameLog) {
            window.GameLog.log(ui('log.debug.proficiency.skill_level', {
                skillId: String(skillId),
                before: String(before),
                after: String(st.skills[skillId].level),
                delta: String(delta)
            }), 'system');
        }
        if (window.CharacterAttributes && typeof window.CharacterAttributes.recalcCharacterStats === 'function') {
            window.CharacterAttributes.recalcCharacterStats({
                getEquipmentState: function () { return IE.getState().equipment; },
                getSkillsState: function () { return IE.getState().skills; },
                getItemTemplate: IE.getItemTemplate,
                getEnchantEntry: IE.getEnchantEntry,
                getStrengthLevel: function () { return IE.getSkillLevel('survival_strength'); }
            });
        }
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (opts && opts.refreshCombat && combatPanelOpen) renderCombatModal();
        renderSurvivalModal();
    }

    function buildSkillRow(opts) {
        var IE = window.InventoryEquipment;
        var row = document.createElement('div');
        row.className = 'survival-row';

        var info = document.createElement('div');
        info.className = 'survival-row-info';
        var nameEl = document.createElement('div');
        nameEl.className = 'survival-name';
        nameEl.textContent = opts.name || '';
        info.appendChild(nameEl);
        if (opts.desc) {
            var descEl = document.createElement('div');
            descEl.className = 'survival-desc';
            descEl.textContent = opts.desc;
            info.appendChild(descEl);
        }

        var levelEl = document.createElement('div');
        levelEl.className = 'survival-level';
        var lv = (IE && typeof IE.getSkillLevel === 'function') ? IE.getSkillLevel(opts.skillId) : 0;
        var levelLabel = (lv || 0) + ' 级';
        if (opts.levelSuffix) levelLabel += ' ' + opts.levelSuffix;
        levelEl.textContent = levelLabel;

        var plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'survival-plus-btn';
        plusBtn.textContent = ui('survival.btn.plus_one');
        plusBtn.onclick = function () {
            addSkillLevelGeneric(opts.skillId, 1, opts.addOpts || {});
        };

        row.appendChild(info);
        row.appendChild(levelEl);
        row.appendChild(plusBtn);
        return row;
    }

    function renderSkillOverviewSurvivalTab(wrap) {
        var list = (window.SurvivalSkills && typeof window.SurvivalSkills.getAll === 'function')
            ? window.SurvivalSkills.getAll()
            : [];
        if (!list.length) {
            var empty = document.createElement('div');
            empty.className = 'skill-overview-empty';
            empty.textContent = ui('skill.tab.empty.survival');
            wrap.appendChild(empty);
            return;
        }
        list.forEach(function (sk) {
            wrap.appendChild(buildSkillRow({
                skillId: sk.id,
                name: sk.name,
                desc: sk.desc,
                addOpts: { gameLog: true }
            }));
        });
    }

    function renderSkillOverviewLifeTab(wrap) {
        if (!LIFE_SKILL_TABLE.length) {
            var empty = document.createElement('div');
            empty.className = 'skill-overview-empty';
            empty.textContent = ui('skill.tab.empty.life');
            wrap.appendChild(empty);
            return;
        }
        LIFE_SKILL_TABLE.forEach(function (sk) {
            wrap.appendChild(buildSkillRow({
                skillId: sk.id,
                name: ui(sk.nameKey),
                desc: ui(sk.descKey),
                addOpts: { gameLog: true }
            }));
        });
    }

    function renderSkillOverviewSpecialTab(wrap) {
        var IE = window.InventoryEquipment;
        var meridianSkillId = (IE && IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID)
            ? IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID
            : 'special_meridian_studies';
        var lv = (IE && typeof IE.getSkillLevel === 'function')
            ? Math.max(0, parseInt(IE.getSkillLevel(meridianSkillId), 10) || 0)
            : 0;
        var suffix = lv >= 1 ? ui('special.skill.meridian_studies.unlocked') : ui('special.skill.meridian_studies.locked');
        wrap.appendChild(buildSkillRow({
            skillId: meridianSkillId,
            name: ui('special.skill.meridian_studies.name'),
            desc: ui('special.skill.meridian_studies.desc'),
            levelSuffix: suffix,
            addOpts: { refreshCombat: true }
        }));
    }

    function renderSurvivalModal() {
        var wrap = document.getElementById('survival-skill-table');
        if (!wrap) return;
        wrap.innerHTML = '';
        var tabBtns = document.querySelectorAll('#modal-survival .skill-overview-tab');
        if (tabBtns && tabBtns.length) {
            tabBtns.forEach(function (btn) {
                var tabId = btn.getAttribute('data-skill-tab') || 'survival';
                btn.classList.toggle('active', currentSkillOverviewTab === tabId);
            });
        }
        if (currentSkillOverviewTab === 'life') {
            renderSkillOverviewLifeTab(wrap);
        } else if (currentSkillOverviewTab === 'special') {
            renderSkillOverviewSpecialTab(wrap);
        } else {
            renderSkillOverviewSurvivalTab(wrap);
        }
    }

    function renderAcupointModal() {
        var AP = window.Acupoints;
        var catBox = document.getElementById('acupoint-cat-tabs');
        var table = document.getElementById('acupoint-table');
        var pagerBox = document.getElementById('acupoint-pager');
        if (!AP || !catBox || !table) return;

        catBox.innerHTML = '';
        table.innerHTML = '';
        if (pagerBox) pagerBox.innerHTML = '';

        var acCats = AP.getCategories ? AP.getCategories() : [];
        if (!combatUIState.curAcupointCat && acCats.length) combatUIState.curAcupointCat = acCats[0].id;

        catBox.style.display = 'flex';
        catBox.style.flexWrap = 'wrap';
        catBox.style.gap = '8px';
        catBox.style.marginBottom = '12px';

        acCats.forEach(function (c) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'combat-cat-btn' + (combatUIState.curAcupointCat === c.id ? ' active' : '');
            btn.textContent = (c.icon ? c.icon + ' ' : '') + c.label;
            btn.onclick = function () {
                combatUIState.curAcupointCat = c.id;
                combatUIState.acupointPage = 0;
                var listAp2 = AP.getAcupointsByCategory(c.id);
                combatUIState.curAcupointId = listAp2.length ? listAp2[0].id : null;
                renderAcupointModal();
            };
            catBox.appendChild(btn);
        });

        var listAp = AP.getAcupointsByCategory(combatUIState.curAcupointCat);
        var pageSize = 18;
        var total = listAp.length;
        var maxPage = total ? Math.max(0, Math.ceil(total / pageSize) - 1) : 0;
        if (combatUIState.acupointPage > maxPage) combatUIState.acupointPage = maxPage;
        if (combatUIState.acupointPage < 0) combatUIState.acupointPage = 0;
        var start = combatUIState.acupointPage * pageSize;
        var end = Math.min(start + pageSize, total);

        for (var i = start; i < end; i++) {
            var a = listAp[i];
            var row = document.createElement('div');
            var unlocked = AP.isUnlocked ? AP.isUnlocked(a.id) : false;
            row.className = 'survival-row';

            var infoWrap = document.createElement('div');
            infoWrap.className = 'acupoint-info';

            var nameEl = document.createElement('div');
            nameEl.className = 'acupoint-name-main';
            nameEl.textContent = a.name;

            var metaEl = document.createElement('div');
            metaEl.className = 'acupoint-meta';
            var metaText = ui(unlocked ? 'acupoint.meta.unlocked' : 'acupoint.meta.locked', { effects: (a.effectsText || '') });
            metaEl.textContent = metaText;

            infoWrap.appendChild(nameEl);
            infoWrap.appendChild(metaEl);
            row.appendChild(infoWrap);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'acupoint-unlock-btn' + (unlocked ? ' unlocked' : '');
            btn.textContent = unlocked ? ui('acupoint.btn.unlocked') : ui('acupoint.btn.unlock');
            btn.disabled = !!unlocked;
            if (!unlocked) {
                (function (acupointId, acupointName) {
                    btn.onclick = function () {
                        if (!AP || !AP.unlock) return;
                        var changed = AP.unlock(acupointId);
                        if (changed) {
                            if (window.GameLog) {
                                window.GameLog.log(
                                    ui('log.system.acupoint.unlocked', { id: (acupointName || acupointId) }),
                                    'system'
                                );
                            }
                            if (window.CharacterAttributes && typeof window.CharacterAttributes.recalcCharacterStats === 'function' && window.InventoryEquipment) {
                                window.CharacterAttributes.recalcCharacterStats({
                                    getEquipmentState: function () { return window.InventoryEquipment.getState().equipment; },
                                    getSkillsState: function () { return window.InventoryEquipment.getState().skills; },
                                    getItemTemplate: window.InventoryEquipment.getItemTemplate,
                                    getEnchantEntry: window.InventoryEquipment.getEnchantEntry,
                                    getStrengthLevel: function () { return window.InventoryEquipment.getSkillLevel('survival_strength'); }
                                });
                            }
                            if (typeof updateStatusPanel === 'function') {
                                updateStatusPanel();
                            }
                        }
                        renderAcupointModal();
                    };
                })(a.id, a.name);
            }
            row.appendChild(btn);

            table.appendChild(row);
        }

        if (pagerBox && total > pageSize) {
            pagerBox.innerHTML = '';
            pagerBox.style.marginTop = '8px';
            pagerBox.style.display = 'flex';
            pagerBox.style.justifyContent = 'space-between';
            pagerBox.style.alignItems = 'center';
            pagerBox.style.fontSize = '11px';
            pagerBox.style.color = '#a8a29e';

            var btnPrev = document.createElement('button');
            btnPrev.type = 'button';
            btnPrev.textContent = ui('pager.prev');
            btnPrev.disabled = combatUIState.acupointPage <= 0;
            btnPrev.style.padding = '4px 10px';
            btnPrev.style.borderRadius = '9999px';
            btnPrev.style.border = '1px solid #4d3f35';
            btnPrev.style.background = '#120e0c';
            btnPrev.style.color = '#e8e6e3';
            btnPrev.style.cursor = btnPrev.disabled ? 'default' : 'pointer';
            if (!btnPrev.disabled) {
                btnPrev.onclick = function () {
                    combatUIState.acupointPage--;
                    renderAcupointModal();
                };
            } else {
                btnPrev.style.opacity = '0.4';
            }

            var info = document.createElement('span');
            info.textContent = ui('pager.info', { cur: (combatUIState.acupointPage + 1), max: (maxPage + 1), total: total });

            var btnNext = document.createElement('button');
            btnNext.type = 'button';
            btnNext.textContent = ui('pager.next');
            btnNext.disabled = combatUIState.acupointPage >= maxPage;
            btnNext.style.padding = '4px 10px';
            btnNext.style.borderRadius = '9999px';
            btnNext.style.border = '1px solid #4d3f35';
            btnNext.style.background = '#120e0c';
            btnNext.style.color = '#e8e6e3';
            btnNext.style.cursor = btnNext.disabled ? 'default' : 'pointer';
            if (!btnNext.disabled) {
                btnNext.onclick = function () {
                    combatUIState.acupointPage++;
                    renderAcupointModal();
                };
            } else {
                btnNext.style.opacity = '0.4';
            }

            pagerBox.appendChild(btnPrev);
            pagerBox.appendChild(info);
            pagerBox.appendChild(btnNext);
        }
    }

    function openSurvivalPanel(initialTab) {
        if (initialTab === 'life' || initialTab === 'special' || initialTab === 'survival') {
            currentSkillOverviewTab = initialTab;
        }
        if (survivalPanelOpen) {
            renderSurvivalModal();
            return;
        }
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        survivalPanelOpen = true;
        var modal = document.getElementById('modal-survival');
        if (modal) modal.classList.add('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '0.1';
            left.style.pointerEvents = 'none';
        }
        renderSurvivalModal();
    }

    function openAcupointPanel() {
        if (acupointPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        acupointPanelOpen = true;
        var modal = document.getElementById('modal-acupoints');
        if (modal) modal.classList.add('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '0.1';
            left.style.pointerEvents = 'none';
        }
        var AP = window.Acupoints;
        if (AP && AP.getCategories) {
            var acCats = AP.getCategories();
            if (!combatUIState.curAcupointCat && acCats.length) combatUIState.curAcupointCat = acCats[0].id;
            var listAp = combatUIState.curAcupointCat && AP.getAcupointsByCategory
                ? AP.getAcupointsByCategory(combatUIState.curAcupointCat)
                : [];
            if (!combatUIState.curAcupointId && listAp.length) {
                combatUIState.curAcupointId = listAp[0].id;
            }
        }
        renderAcupointModal();
    }

    function closeAcupointPanel() {
        if (!acupointPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        acupointPanelOpen = false;
        var modal = document.getElementById('modal-acupoints');
        if (modal) modal.classList.remove('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '';
            left.style.pointerEvents = '';
        }
        render();
    }

    function closeSurvivalPanel() {
        if (!survivalPanelOpen) return;
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        survivalPanelOpen = false;
        var modal = document.getElementById('modal-survival');
        if (modal) modal.classList.remove('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '';
            left.style.pointerEvents = '';
        }
        render();
    }

    if (document.getElementById('btn-survival')) {
        document.getElementById('btn-survival').addEventListener('click', function () {
            if (survivalPanelOpen) closeSurvivalPanel(); else openSurvivalPanel();
        });
    }
    if (document.getElementById('survival-modal-close')) {
        document.getElementById('survival-modal-close').addEventListener('click', closeSurvivalPanel);
    }

    (function bindSkillOverviewTabs() {
        var tabBtns = document.querySelectorAll('#modal-survival .skill-overview-tab');
        if (!tabBtns || !tabBtns.length) return;
        tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var tabId = btn.getAttribute('data-skill-tab') || 'survival';
                if (tabId !== 'survival' && tabId !== 'life' && tabId !== 'special') tabId = 'survival';
                currentSkillOverviewTab = tabId;
                renderSurvivalModal();
            });
        });
    })();

    if (document.getElementById('btn-acupoints')) {
        document.getElementById('btn-acupoints').addEventListener('click', function () {
            if (acupointPanelOpen) closeAcupointPanel(); else openAcupointPanel();
        });
    }
    if (document.getElementById('acupoint-modal-close')) {
        document.getElementById('acupoint-modal-close').addEventListener('click', closeAcupointPanel);
    }

    if (document.getElementById('btn-save')) {
        document.getElementById('btn-save').addEventListener('click', function () {
            if (savePanelOpen) closeSavePanel(); else openSavePanel();
        });
    }
    if (document.getElementById('save-modal-close')) {
        document.getElementById('save-modal-close').addEventListener('click', closeSavePanel);
    }
    if (document.getElementById('btn-save-local-now')) {
        document.getElementById('btn-save-local-now').addEventListener('click', function () {
            if (!window.SaveSystem || typeof window.SaveSystem.saveNow !== 'function') {
                showMsg(ui('save.msg.localFail'), 'error');
                return;
            }
            var ok = window.SaveSystem.saveNow();
            showMsg(ok ? ui('save.msg.localOk') : ui('save.msg.localFail'), ok ? 'info' : 'error');
        });
    }
    if (document.getElementById('btn-save-export')) {
        document.getElementById('btn-save-export').addEventListener('click', function () {
            if (!window.SaveSystem || typeof window.SaveSystem.exportSaveCode !== 'function') {
                showMsg(ui('save.msg.exportFail'), 'error');
                return;
            }
            var cred = getSaveCredentials();
            if (!cred.account || !cred.password) {
                showMsg(ui('save.msg.needAccountPassword'), 'warning');
                return;
            }
            window.SaveSystem.exportSaveCode(cred).then(function (code) {
                var ta = document.getElementById('save-textarea-export');
                if (ta) ta.value = code || '';
                showMsg(ui('save.msg.exportOk'), 'info');
            }).catch(function (e) {
                var m = e && e.message ? String(e.message) : '';
                if (m.indexOf('WebCrypto') >= 0 || m.indexOf('busy') >= 0) {
                    showMsg(m.indexOf('busy') >= 0 ? ui('save.msg.busy') : ui('save.msg.exportFail'), 'error');
                } else {
                    showMsg(ui('save.msg.exportFail'), 'error');
                }
            });
        });
    }
    if (document.getElementById('btn-save-copy-code')) {
        document.getElementById('btn-save-copy-code').addEventListener('click', function () {
            var ta = document.getElementById('save-textarea-export');
            var v = ta && ta.value ? String(ta.value).trim() : '';
            if (!v) {
                showMsg(ui('save.msg.copyFail'), 'warning');
                return;
            }
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(v).then(function () {
                    showMsg(ui('save.msg.copyOk'), 'info');
                }).catch(function () {
                    showMsg(ui('save.msg.copyFail'), 'warning');
                });
            } else {
                showMsg(ui('save.msg.copyFail'), 'warning');
            }
        });
    }
    if (document.getElementById('btn-save-import')) {
        document.getElementById('btn-save-import').addEventListener('click', function () {
            if (!window.SaveSystem || typeof window.SaveSystem.importSaveCode !== 'function') {
                showMsg(ui('save.msg.importFail'), 'error');
                return;
            }
            var taIn = document.getElementById('save-textarea-import');
            var code = taIn && taIn.value ? String(taIn.value).trim() : '';
            var cred = getSaveCredentials();
            if (!cred.account || !cred.password) {
                showMsg(ui('save.msg.needAccountPassword'), 'warning');
                return;
            }
            if (!code) {
                showMsg(ui('save.msg.importFail'), 'warning');
                return;
            }
            window.SaveSystem.importSaveCode(code, cred).then(function (r) {
                if (!r || !r.ok) {
                    if (r && r.reason === 'older') showMsg(ui('save.msg.importRejectedOlder'), 'warning');
                    else showMsg(ui('save.msg.importFail'), 'error');
                    return;
                }
                hideCreationOverlay();
                updateRoleNameFromCharacter();
                showMsg(ui('save.msg.importOk'), 'info');
                closeSavePanel();
                render();
            }).catch(function () {
                showMsg(ui('save.msg.importFail'), 'error');
            });
        });
    }

    function init() {
        loadConfig().then(function () {
            // i18n 已就绪（UIText.setDict 已完成）后再进行地图合并渲染
            if (window.SaveSystem && typeof window.SaveSystem.init === 'function') {
                window.SaveSystem.init({ saveIntervalTicks: 50 });
            }
            // 固定 tick 烹饪：挂接 world tick 递减（避免单次调用瞬推）
            patchSurvivalTickForCookingCraftOnce();
            var mapsPromise = bootstrapMapsFromJson();
            function afterMaps() {
                if (window.SaveSystem && typeof window.SaveSystem.loadRealtime === 'function') {
                    var ok = window.SaveSystem.loadRealtime();
                    if (ok) {
                        // 读档成功后，确保 UI 状态与角色数据一致。
                        hideCreationOverlay();
                        updateRoleNameFromCharacter();
                        syncIntroShellUi();
                        if (window.GameLog) window.GameLog.log('[SaveSystem] loaded realtime save', 'system');
                    } else {
                        // 新档默认先走序章；创角仅在林经理首次对话完成后再弹出。
                        hideCreationOverlay();
                        syncIntroShellUi();
                    }
                    if (window.InventoryEquipment && typeof window.InventoryEquipment.ensureCombatBasicsMigrated === 'function') {
                        window.InventoryEquipment.ensureCombatBasicsMigrated();
                    }
                    if (!ok && window.Survival && typeof window.Survival.initBattleResourcesFull === 'function') {
                        window.Survival.initBattleResourcesFull();
                    }
                }
                syncCookingTempStationsIntoMaps();
                // 读档后：若存在进行中制作，恢复自动 tick 推进
                startCookingCraftIdleIfNeeded();
                // 读档后再渲染一次，避免出现“短暂默认状态闪屏”。
                render();
            }
            if (mapsPromise && typeof mapsPromise.then === 'function') mapsPromise.then(afterMaps);
            else afterMaps();
            setPlayerAvatarSprites({
                down: 'image/player_down.png',
                up: 'image/player_up.png',
                left: 'image/player_left.png',
                right: 'image/player_right.png'
            });
            if (window.GameLog) window.GameLog.log(ui('log.system.enter.scene'), 'system');
            window.SceneCtx.actions = window.SceneCtx.actions || {};
            window.SceneCtx.actions.tryMoveTo = function (tx, ty, dx, dy) {
                if (isStoryMovementLocked()) return;
                if (guardPlayerComaBlocked()) return;
                var ac = getActiveCookingCraft();
                if (ac) {
                    showMsg(ui('cooking.move.blocked', { n: ac.remaining_ticks }), 'info');
                    return;
                }
                if (guardPlayerActionBlocked(ACTION_TYPES.MOVE)) return;
                var st = E.getState();
                var ddx = (dx != null) ? dx : (tx - st.x);
                var ddy = (dy != null) ? dy : (ty - st.y);
                var fromX = st.x;
                var fromY = st.y;
                if (E.moveTo(tx, ty)) {
                    var restStoppedByMove = setRestingActionActive(false, { showMsg: false });
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode(fromX, fromY);
                    }
                    setFacingFromMove(ddx, ddy);
                    stopGatheringIdle();
                    if (restStoppedByMove) showMsg(ui('player.action.rest.cancelled_by_move'), 'info');
                    if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                        window.SceneCtx.pushDirtyCell(fromX, fromY);
                        window.SceneCtx.pushDirtyCell(tx, ty);
                    }
                    if (window.SceneAnimation && typeof window.SceneAnimation.emit === 'function') {
                        window.SceneAnimation.emit('move:step', {
                            mapId: st.mapId,
                            fromX: fromX,
                            fromY: fromY,
                            toX: tx,
                            toY: ty,
                            dx: ddx,
                            dy: ddy
                        });
                    }
                }
            };
            window.SceneCtx.actions.attackEnemy = function (enemyId, ctxMeta) {
                if (guardPlayerComaBlocked()) return;
                if (isPreCreationGameplayRestricted()) {
                    showIntroBlockedMsg();
                    return;
                }
                ctxMeta = ctxMeta || {};
                if (window.SceneCtx && typeof window.SceneCtx.clearPlayerExchangeLimbLocks === 'function') {
                    window.SceneCtx.clearPlayerExchangeLimbLocks();
                }
                var st = (E && typeof E.getState === 'function') ? E.getState() : null;
                if (window.SceneCtx) window.SceneCtx.lastAttackedEnemyId = enemyId != null ? String(enemyId) : null;
                if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                    window.SceneCtx.exitFootworkNieBuMode();
                }
                if (window.CombatPipeline && typeof window.CombatPipeline.runPipeline === 'function') {
                    var intent = pickWorldMeleeAttackIntent(ctxMeta);
                    var defSpeed = 10;
                    var defenderBase = {
                        kind: 'enemy',
                        enemyId: enemyId,
                        parry_rate: ctxMeta.enemy_parry_rate != null ? Number(ctxMeta.enemy_parry_rate) : 0,
                        parry_damage_reduce: ctxMeta.enemy_parry_reduce != null ? Number(ctxMeta.enemy_parry_reduce) : 0
                    };
                    if (window.CombatEnemies && typeof window.CombatEnemies.mergeIntoDefender === 'function') {
                        window.CombatEnemies.mergeIntoDefender(defenderBase);
                    }
                    if (defenderBase.speed != null && isFinite(Number(defenderBase.speed))) defSpeed = Number(defenderBase.speed);

                    var limbUse = ctxMeta.limb_id != null ? ctxMeta.limb_id : intent.limbId;
                    var skUse = ctxMeta.skill_id != null ? ctxMeta.skill_id : intent.skillId;
                    var mvUse = ctxMeta.move_id != null ? ctxMeta.move_id : intent.moveId;

                    // 读取该肢当前槽位成数（ctxMeta 显式传入时优先）
                    var _slotPwr = ctxMeta.power_level != null ? Number(ctxMeta.power_level) : null;
                    if (_slotPwr == null && IE && typeof IE.peekMoveSlotIndexForLimb === 'function') {
                        var _slotPwrIdx = IE.peekMoveSlotIndexForLimb(limbUse);
                        if (_slotPwrIdx >= 0 && typeof IE.getMoveSlotPowerLevel === 'function') {
                            _slotPwr = IE.getMoveSlotPowerLevel(limbUse, _slotPwrIdx);
                        }
                    }

                    var postIds = ctxMeta.post_effect_ids;
                    if (!postIds && ctxMeta.post_effect_id) postIds = [ctxMeta.post_effect_id];
                    if ((!postIds || !postIds.length) && window.CombatInitiative && typeof window.CombatInitiative.getPostEffectIdsForMoveSlot === 'function' && window.InventoryEquipment) {
                        postIds = window.CombatInitiative.getPostEffectIdsForMoveSlot(window.InventoryEquipment, limbUse, skUse, mvUse);
                    }
                    if (!Array.isArray(postIds)) postIds = [];
                    var defPostIds = Array.isArray(defenderBase.counter_post_effect_ids) ? defenderBase.counter_post_effect_ids : [];

                    var plSpeed = 1;
                    if (window.CharacterAttributes && typeof window.CharacterAttributes.getCombatSpeed === 'function') {
                        plSpeed = window.CharacterAttributes.getCombatSpeed();
                    }
                    var initPlan = { mode: 'sequential', firstStrike: 'player' };
                    if (window.CombatInitiative && typeof window.CombatInitiative.resolvePlayerInitiatedExchange === 'function') {
                        initPlan = window.CombatInitiative.resolvePlayerInitiatedExchange({
                            playerSpeed: plSpeed,
                            enemySpeed: defSpeed,
                            attackerPostEffectIds: postIds,
                            defenderPostEffectIds: defPostIds,
                            skillId: skUse,
                            moveId: mvUse
                        });
                    }
                    var CP = window.CombatPipeline;
                    var CMR = window.CombatMeleeResolve;
                    var canEnemyCounter = defenderBase.can_attack !== false;
                    var useSimultaneous = initPlan.mode === 'simultaneous' && canEnemyCounter
                        && CP && typeof CP.flushPendingBuffApplies === 'function'
                        && typeof CP.finalizeSimultaneousStrike === 'function'
                        && CMR && typeof CMR.applyDeferredResourceSpendFromResolveResult === 'function';
                    var enemyActsFirst = initPlan.firstStrike === 'enemy' && canEnemyCounter;

                    var defenderFacingDir = 4;
                    if (window.CombatEnemies && typeof window.CombatEnemies.ensureFacingTowardTarget === 'function') {
                        defenderFacingDir = window.CombatEnemies.ensureFacingTowardTarget(
                            enemyId,
                            st && st.mapId != null ? st.mapId : null,
                            ctxMeta.x,
                            ctxMeta.y,
                            ctxMeta.fromX,
                            ctxMeta.fromY
                        );
                    }

                    function buildPlayerAtkCtx(r0, postIdsArr, simDry) {
                        var rawDmg0 = r0 && isFinite(r0.rawDamage) ? r0.rawDamage : 10;
                        var hitOk0 = r0 ? !!r0.hitRollSuccess : (ctxMeta.hit_roll_success !== false);
                        var hitPt0 = r0 ? r0.hitPart : (ctxMeta.hit_part || 'chest');
                        var skId0 = r0 ? r0.skillId : (ctxMeta.skill_id || 'combat_basic_unarmed');
                        var mvId0 = r0 ? r0.moveId : (ctxMeta.move_id || 'jab');
                        var lmId0 = r0 ? r0.limbId : (ctxMeta.limb_id || 'lhand');
                        var dmgType0 = r0 ? r0.damageType : 'blunt';
                        var modKey0 = r0 ? r0.hitPartModifierKey : null;
                        var moveTags0 = [];
                        if (window.CombatSkills && typeof window.CombatSkills.getSkill === 'function') {
                            var skObj0 = window.CombatSkills.getSkill(skId0);
                            if (skObj0 && Array.isArray(skObj0.moves)) {
                                for (var mi0 = 0; mi0 < skObj0.moves.length; mi0++) {
                                    var mObj0 = skObj0.moves[mi0];
                                    if (mObj0 && mObj0.id === mvId0) {
                                        if (Array.isArray(mObj0.required_limb_tags)) moveTags0 = mObj0.required_limb_tags.slice();
                                        break;
                                    }
                                }
                            }
                        }
                        return {
                            eventIdSuffix: String(enemyId) + '_' + String(mvId0),
                            hitRollSuccess: hitOk0,
                            hitPart: hitPt0,
                            moveId: mvId0,
                            skillId: skId0,
                            limbId: lmId0,
                            damageType: dmgType0,
                            hitPartModifierKey: modKey0,
                            moveTags: moveTags0,
                            subhit_index: 0,
                            is_last_subhit: true,
                            rawDamage: rawDmg0,
                            forceZeroDamageByResourceInsufficient: !!(r0 && r0.forceZeroDamageByResourceInsufficient),
                            simultaneousDryRun: !!simDry,
                            attacker: {
                                kind: 'player',
                                facingDir: (window.PlayerFacing && typeof window.PlayerFacing.getDir === 'function') ? window.PlayerFacing.getDir() : 4,
                                pos: { x: ctxMeta.fromX, y: ctxMeta.fromY },
                                postEffectIds: Array.isArray(postIdsArr) ? postIdsArr.slice() : [],
                                activeVariantIds: (window.InventoryEquipment && typeof window.InventoryEquipment.getActiveVariantIdsForLimb === 'function')
                                    ? window.InventoryEquipment.getActiveVariantIdsForLimb(lmId0)
                                    : []
                            },
                            defender: (function () {
                                var d0 = Object.assign({}, defenderBase);
                                d0.facingDir = defenderFacingDir;
                                d0.pos = { x: ctxMeta.x, y: ctxMeta.y };
                                if (window.InventoryEquipment && typeof window.InventoryEquipment.getParryVariantIdsForLimb === 'function') {
                                    d0.parryVariantIds = [];
                                }
                                return d0;
                            })()
                        };
                    }

                    function buildEnemyCounterAtkCtx(rE, simDry) {
                        var re = rE || {};
                        return {
                            eventIdSuffix: String(enemyId) + '_' + String(re.moveId || 'counter') + (simDry ? '_sim' : ''),
                            hitRollSuccess: !!re.hitRollSuccess,
                            hitPart: re.hitPart || 'chest',
                            moveId: re.moveId || 'enemy_counter_strike',
                            skillId: re.skillId || '__enemy_counter_attack__',
                            limbId: 'rhand',
                            damageType: re.damageType || 'blunt',
                            hitPartModifierKey: re.hitPartModifierKey || null,
                            moveTags: [],
                            subhit_index: 0,
                            is_last_subhit: true,
                            rawDamage: isFinite(re.rawDamage) ? re.rawDamage : 0,
                            forceZeroDamageByResourceInsufficient: false,
                            simultaneousDryRun: !!simDry,
                            attacker: {
                                kind: 'enemy',
                                enemyId: enemyId,
                                postEffectIds: [],
                                facingDir: defenderFacingDir,
                                pos: { x: ctxMeta.x, y: ctxMeta.y }
                            },
                            defender: {
                                kind: 'player',
                                facingDir: (window.PlayerFacing && typeof window.PlayerFacing.getDir === 'function') ? window.PlayerFacing.getDir() : 4,
                                pos: { x: ctxMeta.fromX, y: ctxMeta.fromY }
                            }
                        };
                    }

                    var pipeName = ctxMeta.pipeline || 'melee_hit_enemy_defender';
                    var r = null;
                    var atkCtx = null;
                    var rEnemyCounter = null;
                    var atkCtxEnemy = null;

                    if (useSimultaneous && CMR && typeof CMR.resolvePlayerVsEnemyAttack === 'function' && typeof CMR.resolveEnemyVsPlayerAttack === 'function') {
                        r = CMR.resolvePlayerVsEnemyAttack({
                            skillId: skUse,
                            moveId: mvUse,
                            limbId: limbUse,
                            powerLevel: _slotPwr,
                            defenderSpeed: defSpeed,
                            deferResourceSpend: true
                        });
                        rEnemyCounter = CMR.resolveEnemyVsPlayerAttack({ enemyId: enemyId, attackerSpeed: defSpeed });
                        atkCtx = buildPlayerAtkCtx(r, postIds, true);
                        atkCtxEnemy = buildEnemyCounterAtkCtx(rEnemyCounter, true);
                        if (intent.advanceCursor && window.InventoryEquipment && typeof window.InventoryEquipment.advanceMoveSequenceCursorForLimb === 'function') {
                            window.InventoryEquipment.advanceMoveSequenceCursorForLimb(atkCtx.limbId);
                        }
                        CP.runPipeline(pipeName, atkCtx);
                        CP.runPipeline('melee_hit_player_defender', atkCtxEnemy);
                        if (typeof CP.flushPendingBuffApplies === 'function') {
                            CP.flushPendingBuffApplies(atkCtx);
                            CP.flushPendingBuffApplies(atkCtxEnemy);
                        }
                        if (typeof CMR.applyDeferredResourceSpendFromResolveResult === 'function') {
                            CMR.applyDeferredResourceSpendFromResolveResult(r);
                        }
                        if (typeof CP.finalizeSimultaneousStrike === 'function') {
                            CP.finalizeSimultaneousStrike(atkCtx);
                            CP.finalizeSimultaneousStrike(atkCtxEnemy);
                        }
                    } else if (enemyActsFirst && CMR && typeof CMR.resolveEnemyVsPlayerAttack === 'function' && typeof CMR.resolvePlayerVsEnemyAttack === 'function') {
                        rEnemyCounter = CMR.resolveEnemyVsPlayerAttack({ enemyId: enemyId, attackerSpeed: defSpeed });
                        atkCtxEnemy = buildEnemyCounterAtkCtx(rEnemyCounter, false);
                        CP.runPipeline('melee_hit_player_defender', atkCtxEnemy);
                        if (window.GameLog && atkCtxEnemy.finalDamage != null && typeof window.GameLog.log === 'function') {
                            window.GameLog.log(ui('log.combat.resolve.summary', {
                                dmg: String(Math.round(atkCtxEnemy.finalDamage)),
                                parry: atkCtxEnemy.parrySucceeded ? ui('log.combat.pipeline.parry_yes') : ui('log.combat.pipeline.parry_no')
                            }) + '（先手还击）', 'damage');
                        }
                        r = CMR.resolvePlayerVsEnemyAttack({
                            skillId: skUse,
                            moveId: mvUse,
                            limbId: limbUse,
                            powerLevel: _slotPwr,
                            defenderSpeed: defSpeed
                        });
                        atkCtx = buildPlayerAtkCtx(r, postIds, false);
                        if (intent.advanceCursor && window.InventoryEquipment && typeof window.InventoryEquipment.advanceMoveSequenceCursorForLimb === 'function') {
                            window.InventoryEquipment.advanceMoveSequenceCursorForLimb(atkCtx.limbId);
                        }
                        CP.runPipeline(pipeName, atkCtx);
                    } else {
                        if (!CMR || typeof CMR.resolvePlayerVsEnemyAttack !== 'function') {
                            atkCtx = buildPlayerAtkCtx(null, postIds, false);
                        } else {
                            r = CMR.resolvePlayerVsEnemyAttack({
                                skillId: skUse,
                                moveId: mvUse,
                                limbId: limbUse,
                                powerLevel: _slotPwr,
                                defenderSpeed: defSpeed
                            });
                            atkCtx = buildPlayerAtkCtx(r, postIds, false);
                        }
                        if (intent.advanceCursor && window.InventoryEquipment && typeof window.InventoryEquipment.advanceMoveSequenceCursorForLimb === 'function') {
                            window.InventoryEquipment.advanceMoveSequenceCursorForLimb(atkCtx.limbId);
                        }
                        CP.runPipeline(pipeName, atkCtx);
                        if (window.SceneCtx) window.SceneCtx.playerExchangeAttackLimb = atkCtx.limbId;
                        if (canEnemyCounter && CMR && typeof CMR.resolveEnemyVsPlayerAttack === 'function') {
                            rEnemyCounter = CMR.resolveEnemyVsPlayerAttack({ enemyId: enemyId, attackerSpeed: defSpeed });
                            atkCtxEnemy = buildEnemyCounterAtkCtx(rEnemyCounter, false);
                            CP.runPipeline('melee_hit_player_defender', atkCtxEnemy);
                            if (window.GameLog && atkCtxEnemy.finalDamage != null && typeof window.GameLog.log === 'function') {
                                window.GameLog.log(ui('log.combat.resolve.summary', {
                                    dmg: String(Math.round(atkCtxEnemy.finalDamage)),
                                    parry: atkCtxEnemy.parrySucceeded ? ui('log.combat.pipeline.parry_yes') : ui('log.combat.pipeline.parry_no')
                                }) + '（还击）', 'damage');
                            }
                        }
                    }

                    var skId = atkCtx.skillId;
                    var mvId = atkCtx.moveId;
                    var hitOk = atkCtx.hitRollSuccess;
                    if (window.InventoryEquipment && typeof window.InventoryEquipment.adjustSkillMoveUsage === 'function') {
                        var pd = Number(atkCtx.proficiencyDelta);
                        if (isFinite(pd) && pd !== 0) {
                            window.InventoryEquipment.adjustSkillMoveUsage(skId, mvId, Math.round(pd));
                        }
                    }
                    if (window.GameLog && atkCtx.finalDamage != null) {
                        window.GameLog.log(ui('log.combat.resolve.summary', {
                            dmg: String(Math.round(atkCtx.finalDamage)),
                            parry: atkCtx.parrySucceeded ? ui('log.combat.pipeline.parry_yes') : ui('log.combat.pipeline.parry_no')
                        }), 'damage');
                    }
                    ctxMeta.damageText = hitOk ? String(Math.round(atkCtx.finalDamage != null ? atkCtx.finalDamage : 0)) : ui('log.combat.resolve.hit_miss');
                }
                var enemyLogLabel = enemyId;
                try {
                    if (window.UIText && typeof window.UIText.t === 'function') {
                        enemyLogLabel = window.UIText.t('enemy.name.' + String(enemyId).replace(/\./g, '_'));
                    }
                } catch (eLabel) { /* 无专用名时退回 id */ }
                showMsg(ui('log.system.attack.enemy', { enemyId: enemyLogLabel }), 'system');
                if (window.SceneAnimation && typeof window.SceneAnimation.emit === 'function') {
                    var stNow = E.getState ? E.getState() : null;
                    window.SceneAnimation.emit('combat:attack', {
                        enemyId: enemyId,
                        x: ctxMeta.x,
                        y: ctxMeta.y,
                        fromX: ctxMeta.fromX != null ? ctxMeta.fromX : (stNow ? stNow.x : null),
                        fromY: ctxMeta.fromY != null ? ctxMeta.fromY : (stNow ? stNow.y : null),
                        source: ctxMeta.source || 'unknown',
                        damageText: ctxMeta.damageText != null ? ctxMeta.damageText : null
                    });
                }
                if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                    if (ctxMeta.fromX != null && ctxMeta.fromY != null) window.SceneCtx.pushDirtyCell(ctxMeta.fromX, ctxMeta.fromY);
                    if (ctxMeta.x != null && ctxMeta.y != null) window.SceneCtx.pushDirtyCell(ctxMeta.x, ctxMeta.y);
                }
                bumpCombatRenderProfile(700);
                if (window.Survival && typeof window.Survival.advanceTick === 'function') {
                    window.Survival.advanceTick();
                }
                if (window.GameLog && ctxMeta.source === 'keyboard') {
                    window.GameLog.log(ui('log.system.attack.intent.keyboard'), 'info');
                }
                render();
                if (typeof updateStatusPanel === 'function') updateStatusPanel();
            };
            window.SceneCtx.actions.interactNpc = function (npcId) {
                if (guardPlayerComaBlocked()) return;
                if (guardPlayerActionBlocked(ACTION_TYPES.NPC_INTERACT)) return;
                if (typeof showMsg === 'function') showMsg(ui('log.system.try.interact.npc', { npcId: npcId }), 'system');
                if (window.NPCSystem && typeof window.NPCSystem.openMenu === 'function') window.NPCSystem.openMenu(npcId);
            };
            window.SceneCtx.actions.tryIntentMove = function (tx, ty, dx, dy, source) {
                if (isStoryMovementLocked()) return;
                if (guardPlayerComaBlocked()) return;
                var st = E.getState();
                var ddx = (dx != null) ? dx : (tx - st.x);
                var ddy = (dy != null) ? dy : (ty - st.y);
                if (!ddx && !ddy) return;
                if (Math.abs(ddx) > 1 || Math.abs(ddy) > 1) return;
                var targetX = st.x + ddx;
                var targetY = st.y + ddy;

                // 固定优先级：敌人攻击 > NPC 对话 > 烹饪台互动 > 制药台互动 > 制肥桶互动 > 普通移动
                var enemyId = (typeof E.getEnemyAt === 'function') ? E.getEnemyAt(targetX, targetY) : null;
                if (enemyId) {
                    if (isPreCreationGameplayRestricted()) {
                        showIntroBlockedMsg();
                        return;
                    }
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (window.SceneCtx.actions && typeof window.SceneCtx.actions.attackEnemy === 'function') {
                        window.SceneCtx.actions.attackEnemy(enemyId, {
                            source: source || 'unknown',
                            x: targetX,
                            y: targetY,
                            fromX: st.x,
                            fromY: st.y
                        });
                    }
                    setFacingFromMove(ddx, ddy);
                    stopGatheringIdle();
                    return;
                }

                var npcId = (typeof E.getInteractNpcIdAt === 'function')
                    ? E.getInteractNpcIdAt(targetX, targetY)
                    : ((typeof E.getNpcAt === 'function') ? E.getNpcAt(targetX, targetY) : null);
                if (npcId && window.GameTime && window.NPCSystem && typeof window.NPCSystem.isNpcPresentNow === 'function') {
                    if (!window.NPCSystem.isNpcPresentNow(npcId)) npcId = null;
                }
                if (npcId) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (window.SceneCtx.actions && typeof window.SceneCtx.actions.interactNpc === 'function') {
                        window.SceneCtx.actions.interactNpc(npcId);
                    }
                    setFacingFromMove(ddx, ddy);
                    stopGatheringIdle();
                    return;
                }

                // 烹饪台：若地图未绑定设施 NPC，则邻格点灶格仍直接打开烹饪面板；已绑定则走上方 interactNpc 管线（与林经理同套菜单 + 闲聊）
                var cookingCell = (typeof E.isCookingStationCell === 'function') && E.isCookingStationCell(targetX, targetY);
                var cookingBoundNpc = cookingCell && typeof E.getCookingStationInteractNpcId === 'function'
                    ? E.getCookingStationInteractNpcId(targetX, targetY)
                    : null;
                if (cookingCell && !cookingBoundNpc) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (typeof openCookingStationPanel === 'function') {
                        openCookingStationPanel();
                    }
                    setFacingFromMove(ddx, ddy);
                    stopGatheringIdle();
                    return;
                }

                // 制药台：未绑定设施 NPC 时邻格点台格直接打开面板；已绑定则走上方 interactNpc（闲聊 +「使用制药台」）
                var pharmacyCell = (typeof E.isPharmacyStationCell === 'function') && E.isPharmacyStationCell(targetX, targetY);
                var pharmacyBoundNpc = pharmacyCell && typeof E.getPharmacyStationInteractNpcId === 'function'
                    ? E.getPharmacyStationInteractNpcId(targetX, targetY)
                    : null;
                if (pharmacyCell && !pharmacyBoundNpc) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (typeof openPharmacyStationPanel === 'function') {
                        openPharmacyStationPanel();
                    }
                    setFacingFromMove(ddx, ddy);
                    stopGatheringIdle();
                    return;
                }

                // 制肥桶：未绑定设施 NPC 时邻格点桶格直接打开面板；已绑定则走上方 interactNpc。
                var compostCell = (typeof E.isCompostStationCell === 'function') && E.isCompostStationCell(targetX, targetY);
                var compostBoundNpc = compostCell && typeof E.getCompostStationInteractNpcId === 'function'
                    ? E.getCompostStationInteractNpcId(targetX, targetY)
                    : null;
                if (compostCell && !compostBoundNpc) {
                    if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode();
                    }
                    if (typeof openCompostStationPanel === 'function') {
                        openCompostStationPanel();
                    }
                    setFacingFromMove(ddx, ddy);
                    stopGatheringIdle();
                    return;
                }

                if (window.SceneCtx.actions && typeof window.SceneCtx.actions.tryMoveTo === 'function') {
                    window.SceneCtx.actions.tryMoveTo(targetX, targetY, ddx, ddy);
                }
            };
            window.SceneCtx.actions.tryFootworkNieBuJump = function (gx, gy) {
                if (isStoryMovementLocked()) return false;
                if (guardPlayerComaBlocked()) return false;
                if (isPreCreationGameplayRestricted()) {
                    showIntroBlockedMsg();
                    return false;
                }
                var SKILL_ID = 'combat_basic_footwork';
                var ACTION_ID = 'nie_bu';
                if (!window.SceneCtx || !window.SceneCtx.footworkNieBuMode) return false;
                var st0 = E.getState();
                var fromX = st0.x;
                var fromY = st0.y;
                if (gx === fromX && gy === fromY) return false;
                if (!IE || !IE.getSkillLevel || IE.getSkillLevel(SKILL_ID) < 1) {
                    showMsg(ui('player.action.niebu.fail.no_skill'), 'info');
                    if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode(fromX, fromY);
                    }
                    render();
                    return false;
                }
                var hubs = IE.getCombatState ? IE.getCombatState().hubs : null;
                if (!hubs || hubs.footwork !== SKILL_ID) {
                    showMsg(ui('player.action.niebu.fail.hub'), 'info');
                    if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                        window.SceneCtx.exitFootworkNieBuMode(fromX, fromY);
                    }
                    render();
                    return false;
                }
                var cdRem = IE.getHubActionCooldownRemaining ? IE.getHubActionCooldownRemaining(SKILL_ID, ACTION_ID) : 0;
                if (cdRem > 0) {
                    showMsg(ui('player.action.niebu.fail.cooldown', { ticks: cdRem }), 'info');
                    return false;
                }
                var ha = null;
                var CS = window.CombatSkills;
                if (CS && typeof CS.getSkill === 'function') {
                    var skTpl = CS.getSkill(SKILL_ID);
                    if (skTpl && skTpl.hub_actions) {
                        for (var hi = 0; hi < skTpl.hub_actions.length; hi++) {
                            if (skTpl.hub_actions[hi].id === ACTION_ID) {
                                ha = skTpl.hub_actions[hi];
                                break;
                            }
                        }
                    }
                }
                var radius = ha && ha.leap_radius != null ? (parseInt(ha.leap_radius, 10) || 2) : 2;
                var cooldownTicks = ha && ha.cooldown_ticks != null ? (parseInt(ha.cooldown_ticks, 10) || 10) : 10;
                if (!E.jumpTo || !E.jumpTo(gx, gy, radius)) {
                    showMsg(ui('player.action.niebu.fail.bad_target'), 'info');
                    return false;
                }
                if (IE.setHubActionCooldownRemaining) IE.setHubActionCooldownRemaining(SKILL_ID, ACTION_ID, cooldownTicks);
                var restStoppedByMove = setRestingActionActive(false, { showMsg: false });
                stopGatheringIdle();
                if (typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                    window.SceneCtx.exitFootworkNieBuMode(fromX, fromY, radius);
                }
                setFacingFromMove(gx - fromX, gy - fromY);
                if (restStoppedByMove) showMsg(ui('player.action.rest.cancelled_by_move'), 'info');
                if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                    window.SceneCtx.pushDirtyCell(fromX, fromY);
                    window.SceneCtx.pushDirtyCell(gx, gy);
                }
                var stAfter = E.getState();
                if (window.SceneAnimation && typeof window.SceneAnimation.emit === 'function') {
                    window.SceneAnimation.emit('move:step', {
                        mapId: stAfter.mapId,
                        fromX: fromX,
                        fromY: fromY,
                        toX: stAfter.x,
                        toY: stAfter.y,
                        dx: stAfter.x - fromX,
                        dy: stAfter.y - fromY
                    });
                }
                if (window.Survival && typeof window.Survival.advanceTick === 'function') {
                    window.Survival.advanceTick();
                }
                var tickSnap = window.Survival && typeof window.Survival.getState === 'function' ? window.Survival.getState().tickCount : 0;
                if (window.BuffSystem && typeof window.BuffSystem.triggerBuffPipeline === 'function') {
                    window.BuffSystem.triggerBuffPipeline({
                        event_kind: 'action',
                        event_name: 'footwork_nie_bu_resolved',
                        event_id: 'footwork_nie_bu_' + String(tickSnap) + '_' + fromX + '_' + fromY + '_' + gx + '_' + gy,
                        tags: ['footwork_nie_bu', 'hub_action', 'move'],
                        payload: {
                            hub_skill_id: SKILL_ID,
                            hub_action_id: ACTION_ID,
                            from_x: fromX,
                            from_y: fromY,
                            to_x: stAfter.x,
                            to_y: stAfter.y,
                            facing_dir: (window.PlayerFacing && typeof window.PlayerFacing.getDir === 'function') ? window.PlayerFacing.getDir() : 4
                        }
                    });
                }
                render();
                return true;
            };
            window.SceneCtx.actions.startGatheringIdle = onGatherClick;
            window.SceneCtx.actions.stopGatheringIdle = function (withMsg) {
                stopGatheringIdle();
                if (withMsg) showMsg(ui('log.info.gather.stop'), 'info');
                if (window.SceneRenderer) window.SceneRenderer.render();
            };
            window.SceneCtx.actions.canTakeWaterAtCurrentTile = canTakeWaterAtCurrentTile;
            window.SceneCtx.actions.canAddFuelAtCurrentTile = canAddFuelAtCurrentTile;
            window.SceneCtx.actions.canPourWaterAtCurrentTile = canPourWaterAtCurrentTile;
            window.SceneCtx.actions.onEngineChanged = function () {
                if (window.SceneCtx && typeof window.SceneCtx.exitFootworkNieBuMode === 'function') {
                    window.SceneCtx.exitFootworkNieBuMode();
                }
                if (gatheringIdleTimer && gatheringIdleAt) {
                    var st2 = E.getState();
                    if (st2.mapId !== gatheringIdleAt.mapId || st2.x !== gatheringIdleAt.x || st2.y !== gatheringIdleAt.y)
                        stopGatheringIdle();
                }
                refreshRenderProfile();
                if (window.SceneRenderer) window.SceneRenderer.render();
            };

            function hubAdjacentBattleContext() {
                return !!(window.SceneCtx && typeof window.SceneCtx.hasAdjacentEnemyForCombat === 'function' && window.SceneCtx.hasAdjacentEnemyForCombat());
            }
            var breathHubSkillId = 'combat_basic_breath';
            var diqiHutiBtnEl = document.getElementById('player-action-diqi-huti');
            if (diqiHutiBtnEl) {
                diqiHutiBtnEl.addEventListener('click', function () {
                    var CHA2 = window.CombatHubActions;
                    if (!CHA2 || typeof CHA2.tryExecuteHubAction !== 'function') return;
                    var r2 = CHA2.tryExecuteHubAction(breathHubSkillId, 'diqi_huti', { isBattleContext: hubAdjacentBattleContext });
                    if (!r2.ok) {
                        var vars2 = {};
                        if (r2.cooldown_ticks != null) vars2.ticks = r2.cooldown_ticks;
                        showMsg(ui(r2.reason_key, vars2), 'info');
                        return;
                    }
                    showMsg(ui(r2.reason_key, { shield: r2.shield_value != null ? r2.shield_value : 0 }), 'success');
                    if (window.SceneRenderer) window.SceneRenderer.render();
                    if (typeof updateStatusPanel === 'function') updateStatusPanel();
                });
            }
            var abGroundEl = document.getElementById('action-bar-ground');
            if (abGroundEl && !abGroundEl._actionBarProxy) {
                abGroundEl._actionBarProxy = true;
                abGroundEl.addEventListener('click', function () {
                    var gBtn = document.getElementById('player-action-ground-items');
                    if (gBtn) gBtn.click();
                });
            }
            var abTakeWaterEl = document.getElementById('action-bar-take-water');
            if (abTakeWaterEl && !abTakeWaterEl._actionBarProxy) {
                abTakeWaterEl._actionBarProxy = true;
                abTakeWaterEl.addEventListener('click', function () {
                    var tw = document.getElementById('player-action-take-water');
                    if (tw) tw.click();
                });
            }
            var abPourWaterEl = document.getElementById('action-bar-pour-water');
            if (abPourWaterEl && !abPourWaterEl._actionBarProxy) {
                abPourWaterEl._actionBarProxy = true;
                abPourWaterEl.addEventListener('click', function () {
                    var pw = document.getElementById('player-action-pour-water');
                    if (pw) pw.click();
                });
            }
            var abAddFuelEl = document.getElementById('action-bar-add-fuel');
            if (abAddFuelEl && !abAddFuelEl._actionBarProxy) {
                abAddFuelEl._actionBarProxy = true;
                abAddFuelEl.addEventListener('click', function () {
                    var af = document.getElementById('player-action-add-fuel');
                    if (af) af.click();
                });
            }
            var abDiqiEl = document.getElementById('action-bar-diqi-huti');
            if (abDiqiEl && !abDiqiEl._actionBarProxy) {
                abDiqiEl._actionBarProxy = true;
                abDiqiEl.addEventListener('click', function () {
                    var dh = document.getElementById('player-action-diqi-huti');
                    if (dh) dh.click();
                });
            }

            var btnPlayerActions = document.getElementById('btn-player-actions');
            if (btnPlayerActions && !btnPlayerActions._boundPlayerActions) {
                btnPlayerActions._boundPlayerActions = true;
                btnPlayerActions.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    if (playerActionsSubmenuOpen) closePlayerActionsSubmenu();
                    else openPlayerActionsSubmenu();
                });
            }
            if (!playerActionsOutsideClickBound) {
                playerActionsOutsideClickBound = true;
                document.addEventListener('click', function (ev) {
                    var sub = document.getElementById('player-actions-submenu');
                    var b = document.getElementById('btn-player-actions');
                    if (!sub || !sub.classList.contains('open')) return;
                    var t = ev.target;
                    if (b && (t === b || b.contains(t))) return;
                    if (sub === t || sub.contains(t)) return;
                    closePlayerActionsSubmenu();
                });
            }

            if (window.SceneSystems && typeof window.SceneSystems.init === 'function') window.SceneSystems.init();
            bindQuickBarPinSlotsOnce();
            if (window.SceneRenderer) window.SceneRenderer.render();
        }).catch(function () { render(); });
    }

    function applyFoodDigestBuffFromTemplate(itemId, tpl) {
        var ue = tpl && tpl.use_effect;
        if (!itemId || !ue || typeof ue !== 'object') return false;
        var Buff = window.BuffSystem;
        if (!Buff || typeof Buff.registerRuntimeBuffTemplate !== 'function' || typeof Buff.applyBuff !== 'function') return false;

        var sat = Number(ue.satiety || 0);
        var thi = Number(ue.thirst || 0);
        var nut = Number(ue.nutrition || 0);
        var ene = Number(ue.energy || 0);
        if (!isFinite(sat)) sat = 0;
        if (!isFinite(thi)) thi = 0;
        if (!isFinite(nut)) nut = 0;
        if (!isFinite(ene)) ene = 0;
        if (sat <= 0 && thi <= 0 && nut <= 0 && ene <= 0) return false;

        var dur = Number(tpl.food_buff_duration_ticks);
        if (!isFinite(dur) || dur <= 0) dur = 10;
        dur = Math.max(1, Math.floor(dur));

        var buffId = 'buff_food_digest__' + itemId;
        if (typeof Buff.hasBuffByBuffId === 'function' && Buff.hasBuffByBuffId('player', buffId)) return false;

        var perTick = {
            satiety: sat > 0 ? sat / dur : 0,
            thirst: thi > 0 ? thi / dur : 0,
            nutrition: nut > 0 ? nut / dur : 0,
            energy: ene > 0 ? ene / dur : 0
        };
        var name = (tpl.sn || tpl.name || itemId);
        Buff.registerRuntimeBuffTemplate({
            buff_id: buffId,
            name: '消化中·' + name,
            desc: '食物正在消化中，按 tick 持续生效。',
            durationTicks: dur,
            maxStacks: 1,
            stacksAddOnApply: 1,
            priority: 100,
            listenerSide: 'self',
            consumeMode: 'always',
            consumeLayersFixed: 0,
            applyMode: 'always_apply',
            triggerEventKind: ['world'],
            triggerEventName: ['tick_advanced'],
            triggerTags: ['time', 'tick'],
            effects: [{ type: 'survival_delta', params: perTick }],
            food_digest: true
        });
        return Buff.applyBuff('player', buffId, 'item:' + itemId, null);
    }

    function toBoolFlag(v) {
        if (v === true || v === 1) return true;
        var s = String(v == null ? '' : v).trim().toLowerCase();
        return s === '1' || s === 'true';
    }

    function itemTemplateIsConsumable(tpl) {
        if (!tpl) return false;
        var edible = toBoolFlag(tpl.edible);
        if (edible && tpl.edible_buff_id && String(tpl.edible_buff_id).trim()) return true;
        var usable = toBoolFlag(tpl.usable);
        if (usable && tpl.use_buff_id && String(tpl.use_buff_id).trim()) return true;
        var ue = tpl.use_effect;
        return !!(ue && typeof ue === 'object');
    }

    function applyItemUseEffectFromTemplate(itemId, tpl) {
        var ue = tpl && tpl.use_effect;
        var Buff = window.BuffSystem;
        var edible = toBoolFlag(tpl ? tpl.edible : null);
        var edibleBuffId = tpl && tpl.edible_buff_id ? String(tpl.edible_buff_id).trim() : '';
        if (edible && edibleBuffId && Buff && typeof Buff.applyBuff === 'function') {
            if (typeof Buff.hasBuffByBuffId === 'function' && Buff.hasBuffByBuffId('player', edibleBuffId)) return false;
            return Buff.applyBuff('player', edibleBuffId, 'item:' + itemId, null);
        }
        var usable = toBoolFlag(tpl ? tpl.usable : null);
        var useBuffId = tpl && tpl.use_buff_id ? String(tpl.use_buff_id).trim() : '';
        if (usable && useBuffId && Buff && typeof Buff.applyBuff === 'function') {
            if (typeof Buff.hasBuffByBuffId === 'function' && Buff.hasBuffByBuffId('player', useBuffId)) return false;
            return Buff.applyBuff('player', useBuffId, 'item:' + itemId, null);
        }
        if (!ue || typeof ue !== 'object') return false;
        if ((tpl && tpl.category) === 'food') return applyFoodDigestBuffFromTemplate(itemId, tpl);
        var Surv = window.Survival;
        if (!Surv) return false;
        var n;
        var any = false;
        if (ue.satiety != null && typeof Surv.addSatiety === 'function') {
            n = Number(ue.satiety);
            if (isFinite(n) && n !== 0) { Surv.addSatiety(n); any = true; }
        }
        if (ue.thirst != null && typeof Surv.addThirst === 'function') {
            n = Number(ue.thirst);
            if (isFinite(n) && n !== 0) { Surv.addThirst(n); any = true; }
        }
        if (ue.nutrition != null && typeof Surv.addNutrition === 'function') {
            n = Number(ue.nutrition);
            if (isFinite(n) && n !== 0) { Surv.addNutrition(n); any = true; }
        }
        if (ue.energy != null && typeof Surv.addEnergy === 'function') {
            n = Number(ue.energy);
            if (isFinite(n) && n !== 0) { Surv.addEnergy(n); any = true; }
        }
        return any;
    }

    function tryUseItemFromContainer(containerType, index, opts) {
        var inv = window.InventoryEquipment;
        if (!inv || typeof inv.takeItemFromContainer !== 'function') return false;
        var options = opts || {};
        if (guardPlayerActionBlocked(ACTION_TYPES.ITEM_USE, { level: 'warn' })) return false;
        var arr = containerType === 'pocket' ? (inv.getPocketArray ? inv.getPocketArray() : [])
            : (containerType === 'vest' ? (inv.getVestArray ? inv.getVestArray() : [])
                : (containerType === 'backpack' ? (inv.getBackpackArray ? inv.getBackpackArray() : [])
                    : []));
        var cell = arr[index];
        if (!cell || !cell.item_id) return false;
        var itemId = cell.item_id;
        var tpl = inv.getItemTemplate(itemId);
        if (!itemTemplateIsConsumable(tpl)) {
            if (!options.silent) showMsg(ui('item.use.cannot'), 'info');
            return false;
        }
        var taken = inv.takeItemFromContainer(containerType, index);
        if (!taken.success || !taken.item) {
            if (!options.silent) showMsg(ui('item.use.fail'), 'warn');
            return false;
        }
        if (!applyItemUseEffectFromTemplate(itemId, tpl)) {
            if (inv.putItemIntoDefaultContainer) inv.putItemIntoDefaultContainer(taken.item);
            if (!options.silent) showMsg(ui('item.use.cannot'), 'info');
            return false;
        }
        var char0 = inv.getCharacterForDisplay ? inv.getCharacterForDisplay() : null;
        var tier0 = inv.getItemDisplayTier ? inv.getItemDisplayTier(itemId, char0) : 0;
        var dispName = inv.getDisplayName ? inv.getDisplayName(tpl, tier0, char0) : itemId;
        if (!options.silent) showMsg(ui('item.use.ok', { name: dispName }), 'success');
        if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (typeof backpackPanelOpen !== 'undefined' && backpackPanelOpen && typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
        return true;
    }

    function tryEquipItemFromContainer(containerType, index, opts) {
        var inv = window.InventoryEquipment;
        if (!inv || typeof inv.takeItemFromContainer !== 'function' || typeof inv.equip !== 'function') return false;
        var options = opts || {};
        var arr = containerType === 'pocket' ? (inv.getPocketArray ? inv.getPocketArray() : [])
            : (containerType === 'vest' ? (inv.getVestArray ? inv.getVestArray() : [])
                : (containerType === 'backpack' ? (inv.getBackpackArray ? inv.getBackpackArray() : [])
                    : []));
        var cell = arr[index];
        if (!cell || !cell.item_id) return false;
        var tpl = inv.getItemTemplate(cell.item_id);
        if (!tpl || !tpl.equip_slot) return false;
        var posNow = E && E.getState ? E.getState() : null;

        var taken = inv.takeItemFromContainer(containerType, index);
        if (!taken.success || !taken.item) return false;
        var itemToEquip = taken.item;
        if (itemToEquip && itemToEquip.count != null) itemToEquip.count = 1;

        var stNow = inv.getState ? inv.getState() : {};
        var slotId = tpl.equip_slot;
        var currentEq = (stNow && stNow.equipment) ? stNow.equipment[slotId] : null;
        if (currentEq && typeof inv.unequip === 'function') {
            var unequipped = inv.unequip(slotId, posNow);
            if (unequipped) {
                var placedOld = inv.putItemIntoDefaultContainer ? inv.putItemIntoDefaultContainer(unequipped) : null;
                if ((!placedOld || !placedOld.placed) && posNow && posNow.mapId != null && posNow.x != null && posNow.y != null && typeof inv.addItemToGround === 'function') {
                    inv.addItemToGround(posNow.mapId, posNow.x, posNow.y, unequipped);
                }
            }
        }

        var res = inv.equip(slotId, itemToEquip);
        if (!res || !res.success) {
            var placedNew = inv.putItemIntoDefaultContainer ? inv.putItemIntoDefaultContainer(itemToEquip) : null;
            if ((!placedNew || !placedNew.placed) && posNow && posNow.mapId != null && posNow.x != null && posNow.y != null && typeof inv.addItemToGround === 'function') {
                inv.addItemToGround(posNow.mapId, posNow.x, posNow.y, itemToEquip);
            }
            if (!options.silent) {
                if (res && res.message) showMsg(res.message, 'warn');
                else showMsg(ui('inv.equip'), 'warn');
            }
            return false;
        }

        if (!options.silent) showMsg(ui('log.success.equipped'), 'success');
        if (typeof updateStatusPanel === 'function') updateStatusPanel();
        if (typeof backpackPanelOpen !== 'undefined' && backpackPanelOpen && typeof updateBackpackPanel === 'function') updateBackpackPanel();
        if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
        return true;
    }

    function tryUseQuickBeltDigit(digit) {
        var inv = window.InventoryEquipment;
        if (!inv || typeof inv.getQuickBeltSlotSource !== 'function') return;
        if (digit < 1 || digit > 9) return;
        var beltIndex = digit - 1;
        var total = typeof inv.getQuickBeltSlots === 'function' ? inv.getQuickBeltSlots() : 0;
        if (beltIndex < 0 || beltIndex >= total) return;
        var src = inv.getQuickBeltSlotSource(beltIndex);
        if (!src || !src.type) return;
        tryUseItemFromContainer(src.type, src.index);
    }

    // Expose entrypoints for bootstrap.js
    window.SceneApp = window.SceneApp || {};
    window.SceneApp.init = init;
    window.SceneApp.loadConfig = loadConfig;
    window.SceneApp.tryUseItemFromContainer = tryUseItemFromContainer;
    window.SceneApp.tryEquipItemFromContainer = tryEquipItemFromContainer;
    window.SceneApp.render = render;
    window.SceneApp.openCharacterCreationAfterIntro = openCharacterCreationAfterIntro;
    window.SceneApp.isStoryMovementLocked = isStoryMovementLocked;
    window.SceneApp.isPreCreationGameplayRestricted = isPreCreationGameplayRestricted;
    window.SceneApp.tryUseQuickBeltDigit = tryUseQuickBeltDigit;
    window.SceneApp.ACTION_TYPES = ACTION_TYPES;
    window.SceneApp.isPlayerActionDisabledByBuff = isPlayerActionDisabledByBuff;
    window.SceneApp.guardPlayerActionBlocked = guardPlayerActionBlocked;
    window.SceneApp.tryCookAtStation = tryCookAtStation;
    window.SceneApp.tryPharmacyAtStation = tryPharmacyAtStation;
    window.SceneApp.openCookingStationPanel = openCookingStationPanel;
    window.SceneApp.closeCookingStationPanel = closeCookingStationPanel;
    window.SceneApp.openPharmacyStationPanel = openPharmacyStationPanel;
    window.SceneApp.closePharmacyStationPanel = closePharmacyStationPanel;
    window.SceneApp.openCompostStationPanel = openCompostStationPanel;
    window.SceneApp.closeCompostStationPanel = closeCompostStationPanel;
    window.SceneApp.trySleepAtBed = trySleepAtBed;
    window.SceneApp.isCookingStationPanelBlockedByRepair = isCookingUiBlockedByRepair;
    window.SceneApp.isPharmacyStationPanelBlockedByRepair = isPharmacyUiBlockedByRepair;
    window.SceneApp.resetCookingStateForNewCharacter = resetCookingStateForNewCharacter;
    window.SceneApp.getKnownCookingRecipeIds = function () {
        var o = window.SceneCtx && window.SceneCtx.known_cooking_recipes;
        if (!o || typeof o !== 'object') return [];
        var a = [];
        var k;
        for (k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k) && o[k]) a.push(String(k));
        }
        a.sort();
        return a;
    };
    window.SceneApp.getCookingStationAccessories = function () {
        return getCookingStationState().installed_accessory_item_ids.slice();
    };
    window.SceneApp.getKnownPharmacyRecipeIds = function () {
        var o = window.SceneCtx && window.SceneCtx.known_pharmacy_recipes;
        if (!o || typeof o !== 'object') return [];
        var a = [];
        var k;
        for (k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k) && o[k]) a.push(String(k));
        }
        a.sort();
        return a;
    };
    window.SceneApp.setCookingStationAccessories = function (ids) {
        var s = getCookingStationState();
        if (!Array.isArray(ids)) {
            s.installed_accessory_item_ids = [];
            return;
        }
        var seen = {};
        var out = [];
        var i;
        for (i = 0; i < ids.length; i++) {
            var z = String(ids[i] || '').trim();
            if (!z || seen[z]) continue;
            seen[z] = true;
            out.push(z);
        }
        s.installed_accessory_item_ids = out;
    };
    window.SceneApp.placeTempCookingStation = function (mapId, x, y, options) {
        return placeTempCookingStation(mapId, x, y, options || {});
    };
    window.SceneApp.placeTempCookingStationAtPlayer = function (options) {
        var st = E && typeof E.getState === 'function' ? E.getState() : null;
        if (!st) return null;
        return placeTempCookingStation(st.mapId, st.x, st.y, options || {});
    };
    window.SceneApp.removeTempCookingStation = function (mapId, x, y) {
        removeCookingTempStationAt(String(mapId || ''), Math.floor(Number(x)), Math.floor(Number(y)));
        syncCookingTempStationsIntoMaps();
        markCellDirty(String(mapId || ''), Math.floor(Number(x)), Math.floor(Number(y)));
        if (window.SceneRenderer) window.SceneRenderer.render();
    };
    window.SceneApp.buildItemTooltipHtml = buildItemTooltipHtml;
    window.SceneApp.buildItemTooltipHtmlForTemplate = buildItemTooltipHtmlForTemplate;
    window.SceneApp.formatItemAttributes = formatItemAttributes;
    window.SceneApp.showItemTooltip = showItemTooltip;
    window.SceneApp.hideItemTooltip = hideItemTooltip;
    window.SceneApp.executeQuickBarPinnedSlot = executeQuickBarPinnedSlot;
    window.SceneApp.clearQuickBarPinSlot = clearQuickBarPinSlot;
})();

