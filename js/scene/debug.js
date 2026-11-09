/**
 * SceneDebug — 调试操作与配方校验展示.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var IE = window.InventoryEquipment;
    var ATTR_EXP_DEBUG_STORAGE_KEY, attrExpDebugToggle;

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
            empty.textContent = window.SceneFeedback.ui('debug.recipe_schema.empty');
            return;
        }

        btn.style.display = '';
        btn.textContent = window.SceneFeedback.ui('debug.recipe_schema.btn', { count: rows.length });
        panel.classList.toggle('show', !!window.CombatPanel.combatUIState.recipeSchemaListOpen);
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

    function debugCombatPlus50() {
            var skillId = window.CombatPanel.combatUIState.curSkillId;
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
                window.GameLog.log(window.SceneFeedback.ui('log.debug.proficiency.skill_level', {
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
            if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
            if (window.CombatPanel.combatPanelOpen) window.SceneMapView.refreshRenderProfile();
            window.CombatPanel.renderCombatModal();

    }

    function bindHudDebug(id, action) {
        window.SceneCtx.hudDebugActions[id] = action;
        var button = document.getElementById(id);
        if (button && !window.SvelteHUD) button.addEventListener('click', action);
    }
    function legacyDebugPanelOpeners() { return {
        backpack: window.InventoryPanel.openBackpackPanel,
        equipment: window.InventoryPanel.openEquipmentPanel,
        agriculture: window.AgricultureActions.openAgriculturePanel,
        livestock: window.LivestockActions.openLivestockPanel,
        hideout: window.WarehouseActions.openHideoutWarehousePanel,
        baseWarehouse: window.WarehouseActions.openBaseWarehousePanel,
        cooking: CookingStationPanel.open,
        pharmacy: PharmacyStationPanel.open,
        compost: CompostPanel.open,
        combat: window.CombatPanel.openCombatPanel,
        survival: window.SkillOverview.openSurvivalPanel,
        save: window.SavePanel.openSavePanel,
        uiMenu: window.SceneWindows.openUiWindowsMenu
    }; }

    function debugOpenPanel(name, tab) {
        var fn = window.SceneApp.debugPanelOpeners[name];
        if (typeof fn !== 'function') return false;
        if (name === 'survival' && tab) fn(tab);
        else fn();
        return true;
    }

    function bindPharmacyDebug() {

        // 制药调试：药瘾 +10（k242 状态行联调）
        bindHudDebug('status-addiction-debug-plus10', function () {
                var PE = window.PharmacyEffects;
                if (!PE || typeof PE.addAddiction !== 'function') return;
                var cur = PE.addAddiction(10);
                if (window.GameLog && typeof window.GameLog.log === 'function') {
                    window.GameLog.log(window.SceneFeedback.ui('log.debug.pharmacy.addiction', { cur: String(Math.round(cur)), delta: '10' }), 'system');
                }
                if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
                if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
            });
    }

    function initialize() {
        ATTR_EXP_DEBUG_STORAGE_KEY = 'cabi_attr_exp_debug_enabled_v1';
        attrExpDebugToggle = document.getElementById('status-attr-exp-debug-toggle');
    }

    function bind() {

    if (document.getElementById('btn-debug-combat-skill-plus50')) document.getElementById('btn-debug-combat-skill-plus50').addEventListener('click', debugCombatPlus50);

    if (document.getElementById('btn-debug-recipe-schema-errors')) {
        document.getElementById('btn-debug-recipe-schema-errors').addEventListener('click', function () {
            window.CombatPanel.combatUIState.recipeSchemaListOpen = !window.CombatPanel.combatUIState.recipeSchemaListOpen;
            renderRecipeSchemaValidationDebugList();
        });
    }

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

    window.SceneCtx.hudDebugActions = {};

    ['jingu', 'flexibility', 'breath', 'dexterity', 'focus'].forEach(function (attrId) {
        bindHudDebug('status-attr-exp-debug-plus-' + attrId, function () {
            var CA = window.CharacterAttributes;
            if (!CA || typeof CA.grantAttributeExp !== 'function') return;
            var res = CA.grantAttributeExp('player', [{ attr_id: attrId, exp: 50000 }], { source: 'status_attr_exp_debug_button' });
            if (window.GameLog && res && Array.isArray(res.applied) && res.applied.length > 0) {
                window.GameLog.log('[debug] attr_exp ' + String(res.applied[0].exp_applied) + ' -> ' + String(attrId), 'system');
            }
            if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        });
    });

    bindHudDebug('status-diqi-debug-plus50', function () {
            var Surv = window.Survival;
            if (!Surv || typeof Surv.changeDiqi !== 'function') return;
            var res = Surv.changeDiqi({ maxDelta: 50, capLimitDelta: 50, sourceTag: 'debug_diqi_max_plus50' });
            if (window.GameLog && typeof window.GameLog.log === 'function') {
                window.GameLog.log('[debug] diqi_max -> ' + String(res.diqi_max) + ' (cur ' + String(res.diqi_current) + ')', 'system');
            }
            if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
            if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
        });

    // 疼痛调试（k229）：直接 +30（同档位判定口径：封顶 = min(100, 25+0.75×平均损毁%)）
    bindHudDebug('status-pain-debug-plus30', function () {
            var Surv2 = window.Survival;
            if (!Surv2 || typeof Surv2.debugAddPain !== 'function') return;
            var piDbg = Surv2.debugAddPain(30) || {};
            if (window.GameLog && typeof window.GameLog.log === 'function') {
                window.GameLog.log('[debug] 疼痛 +30 → 当前 ' + String(piDbg.stored) + '（生效 ' + String(piDbg.effective)
                    + '，封顶 ' + String(piDbg.cap) + '，档位 ' + String(piDbg.tier) + '）', 'system');
            }
            if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
            if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
        });

    bindHudDebug('status-stun-debug-plus50', function () {
            var IE2 = window.InventoryEquipment;
            if (!IE2 || typeof IE2.addPlayerStun !== 'function') return;
            // 与真实命中头结算同口径：先吃抗眩晕比例减免（37 §9.2）
            var resistDbg = (typeof IE2.getHeadAntiStunPct === 'function') ? IE2.getHeadAntiStunPct() : 0;
            var netDbg = Math.max(1, Math.round(50 * (1 - resistDbg)));
            if (IE2.getPlayerStunGain) netDbg = IE2.getPlayerStunGain(netDbg);
            var r = IE2.addPlayerStun(netDbg, 1);
            if (window.GameLog && typeof window.GameLog.log === 'function') {
                window.GameLog.log('[debug] 模拟打头眩晕 +50 → 抗眩晕 ' + String(Math.round(resistDbg * 100)) + '% 减免后 +' + String(netDbg)
                    + '，当前 ' + String(r.value) + (r.triggered ? '（触发眩晕，本回合无法行动）' : ''), 'system');
            }
            if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
            if (window.SceneRenderer && typeof window.SceneRenderer.render === 'function') window.SceneRenderer.render();
        });
    }

    window.SceneDebug = {
        initialize: initialize,
        bind: bind,
        bindPharmacyDebug: bindPharmacyDebug,
        debugCombatPlus50: debugCombatPlus50,
        debugOpenPanel: debugOpenPanel,
        getRecipeSchemaValidationReport: getRecipeSchemaValidationReport,
        legacyDebugPanelOpeners: legacyDebugPanelOpeners,
        renderRecipeSchemaValidationDebugList: renderRecipeSchemaValidationDebugList
    };
})(window);
