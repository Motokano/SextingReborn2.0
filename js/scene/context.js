/**
 * SceneContextState — 场景公开上下文、认知可见性与临时交互标记.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;
    var G = window.Gathering;
    var IE = window.InventoryEquipment;
    var CELL_PX = E.CELL_PX;
    var CENTER_OFFSET_X = E.CENTER_OFFSET_X;
    var CENTER_OFFSET_Y = E.CENTER_OFFSET_Y;

    function initialize() {

    }

    function bind() {

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
        isTimeHudVisible: function () { return !!window.SceneStatusPanel.timeHudVisible; },
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
            if (window.SvelteCarryPilot) window.SvelteCarryPilot.invalidate();
            if (window.SvelteHUD) window.SvelteHUD.invalidate();
        },
        setSurvivalMetricVisibilityRule: function (metricId, rule) {
            if (!metricId) return;
            this.survivalMetricVisibilityRules = this.survivalMetricVisibilityRules || {};
            this.survivalMetricVisibilityRules[String(metricId)] = rule;
            if (window.SvelteCarryPilot) window.SvelteCarryPilot.invalidate();
            if (window.SvelteHUD) window.SvelteHUD.invalidate();
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
                        // Retired actions in old saves leave an empty slot; preserve other positions.
                        if (partsHub[2] === 'xue_qi_hua_jing' || partsHub[2] === 'tu_qi_na_jing') continue;
                        out[j] = s;
                        continue;
                    }
                    if (s.indexOf('action|') === 0) {
                        var partsAction = s.split('|');
                        if (partsAction.length < 2 || !partsAction[1]) continue;
                        if (partsAction[1] !== 'rest_toggle' && partsAction[1] !== 'drink_flask') continue;
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
    }

    window.SceneContextState = {
        initialize: initialize,
        bind: bind
    };
})(window);
