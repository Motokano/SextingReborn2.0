/**
 * SkillOverview — 生存/生活/特殊技能总览.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {

    var survivalPanelOpen, currentSkillOverviewTab, LIFE_SKILL_TABLE;

    /** 通用：给指定技能 id 加等级；触发属性重算与 UI 刷新。 */
    function addSkillLevelGeneric(skillId, plus, opts) {
        if (window.BookReading && window.BookReading.isBookSkill(skillId)) return;
        var IE = window.InventoryEquipment;
        if (!IE || typeof IE.getState !== 'function' || !skillId) return;
        var st = IE.getState();
        if (!st.skills || typeof st.skills !== 'object') st.skills = {};
        if (!st.skills[skillId] || typeof st.skills[skillId] !== 'object') st.skills[skillId] = { level: 0, move_usage: {} };
        var before = Math.max(0, parseInt(st.skills[skillId].level, 10) || 0);
        var delta = Math.max(1, parseInt(plus, 10) || 1);
        var survival = window.SurvivalSkills && window.SurvivalSkills.getById(skillId);
        st.skills[skillId].level = survival && survival.max_level ? Math.min(IE.getProgressionSkillCap(skillId), before + delta) : before + delta;
        if (survival && survival.max_level) IE.addStudyExp(skillId, 0);
        if (!st.skills[skillId].move_usage || typeof st.skills[skillId].move_usage !== 'object') st.skills[skillId].move_usage = {};
        if (opts && opts.gameLog && window.GameLog) {
            window.GameLog.log(window.SceneFeedback.ui('log.debug.proficiency.skill_level', {
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
        if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
        if (opts && opts.refreshCombat && window.CombatPanel.combatPanelOpen) window.CombatPanel.renderCombatModal();
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
        var levelLabel = (lv || 0) + window.SceneFeedback.ui('combat.level.suffix');
        if (opts.levelSuffix) levelLabel += ' ' + opts.levelSuffix;
        // 自修进度（05 5.8）：study_exp / 下一级潜能成本
        var sExp = (IE && typeof IE.getStudyExp === 'function') ? IE.getStudyExp(opts.skillId) : 0;
        if (sExp > 0 && window.CombatSkills && typeof window.CombatSkills.getPotentialCostForLevel === 'function') {
            var clObj = IE.getState().skills || {};
            var costNow = window.CombatSkills.getPotentialCostForLevel(opts.skillId, lv || 0, {
                skills: clObj,
                skill_max_level_bonus: (IE.getState().skill_max_level_bonus || {})
            });
            levelLabel += ' · ' + window.SceneFeedback.ui('survival.study.progress', { exp: String(sExp), cost: String(costNow || '—') });
        }
        levelEl.textContent = levelLabel;

        var plusBtn = document.createElement('button');
        plusBtn.type = 'button';
        plusBtn.className = 'survival-plus-btn';
        plusBtn.textContent = window.SceneFeedback.ui('survival.btn.plus_one');
        plusBtn.onclick = function () {
            addSkillLevelGeneric(opts.skillId, 1, opts.addOpts || {});
        };

        // 自修开关（05 5.8 / 11 技能升级主干）
        var studyBtn = document.createElement('button');
        studyBtn.type = 'button';
        studyBtn.className = 'survival-plus-btn';
        var isStudying = !!(window.Survival && typeof window.Survival.isStudyActive === 'function' && window.Survival.isStudyActive()
            && window.Survival.getStudySkillId() === opts.skillId);
        studyBtn.textContent = window.SceneFeedback.ui(isStudying ? 'survival.btn.stop_study' : 'survival.btn.study');
        studyBtn.onclick = (function (skillId, name) {
            return function () {
                if (!window.Survival || typeof window.Survival.startStudy !== 'function') return;
                if (window.Survival.isStudyActive() && window.Survival.getStudySkillId() === skillId) {
                    window.Survival.stopStudy();
                    if (window.GameLog) window.GameLog.log(window.SceneFeedback.ui('log.system.study.stopped_manual'), 'info');
                } else {
                    var r = window.Survival.startStudy(skillId);
                    if (r && r.ok) {
                        if (window.GameLog) window.GameLog.log(window.SceneFeedback.ui('log.system.study.started', { name: name || skillId }), 'system');
                    } else if (window.GameLog) {
                        window.GameLog.log(window.SceneFeedback.ui('log.system.study.start_fail_' + ((r && r.reason) || 'invalid')), 'warn');
                    }
                }
                renderSurvivalModal();
                if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
            };
        })(opts.skillId, opts.name || '');

        row.appendChild(info);
        row.appendChild(levelEl);
        if (!(window.BookReading && window.BookReading.isBookSkill(opts.skillId))) {
            row.appendChild(plusBtn);
            row.appendChild(studyBtn);
        } else {
            var bookProgress = window.BookReading.progress(window.BookReading.skillProfile(opts.skillId));
            levelEl.textContent = (lv || 0) + window.SceneFeedback.ui('combat.level.suffix') + (bookProgress.cost ? ' · ' + bookProgress.exp + ' / ' + bookProgress.cost + ' 经验' : '');
        }
        return row;
    }

    function renderSkillOverviewSurvivalTab(wrap) {
        var list = (window.SurvivalSkills && typeof window.SurvivalSkills.getAll === 'function')
            ? window.SurvivalSkills.getAll()
            : [];
        if (!list.length) {
            var empty = document.createElement('div');
            empty.className = 'skill-overview-empty';
            empty.textContent = window.SceneFeedback.ui('skill.tab.empty.survival');
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
            empty.textContent = window.SceneFeedback.ui('skill.tab.empty.life');
            wrap.appendChild(empty);
            return;
        }
        LIFE_SKILL_TABLE.forEach(function (sk) {
            wrap.appendChild(buildSkillRow({
                skillId: sk.id,
                name: window.SceneFeedback.ui(sk.nameKey),
                desc: window.SceneFeedback.ui(sk.descKey),
                addOpts: { gameLog: true }
            }));
        });
    }

    function renderSkillOverviewSpecialTab(wrap) {
        var IE = window.InventoryEquipment;
        var anatomySkillId = (IE && IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID)
            ? IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID
            : 'special_meridian_studies';
        var lv = (IE && typeof IE.getSkillLevel === 'function')
            ? Math.max(0, parseInt(IE.getSkillLevel(anatomySkillId), 10) || 0)
            : 0;
        var suffix = lv >= 1 ? window.SceneFeedback.ui('special.skill.meridian_studies.unlocked') : window.SceneFeedback.ui('special.skill.meridian_studies.locked');
        wrap.appendChild(buildSkillRow({
            skillId: anatomySkillId,
            name: window.SceneFeedback.ui('special.skill.meridian_studies.name'),
            desc: window.SceneFeedback.ui('special.skill.meridian_studies.desc'),
            levelSuffix: suffix,
            addOpts: { refreshCombat: true }
        }));
    }

    function renderSurvivalModal() {
        if (window.SveltePanels) { window.SveltePanels.refresh('survival'); return; }
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

    function openSurvivalPanel(initialTab) {
        if (initialTab === 'life' || initialTab === 'special' || initialTab === 'survival') {
            currentSkillOverviewTab = initialTab;
        }
        if (survivalPanelOpen) {
            renderSurvivalModal();
            return;
        }
        survivalPanelOpen = true;
        if (window.SveltePanels) window.SveltePanels.refresh('survival');
        var modal = document.getElementById('modal-survival');
        if (modal && !window.SveltePanels) modal.classList.add('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '0.1';
            left.style.pointerEvents = 'none';
        }
        renderSurvivalModal();
    }

    function closeSurvivalPanel() {
        if (!survivalPanelOpen) return;
        survivalPanelOpen = false;
        if (window.SveltePanels) window.SveltePanels.refresh('survival');
        var modal = document.getElementById('modal-survival');
        if (modal && !window.SveltePanels) modal.classList.remove('show');
        var left = document.getElementById('left-hud');
        if (left) {
            left.style.opacity = '';
            left.style.pointerEvents = '';
        }
        window.SceneMapView.render();
    }

    function initialize() {
        survivalPanelOpen = false;
        currentSkillOverviewTab = 'survival';
        LIFE_SKILL_TABLE = [
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
    }

    function bind() {

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

    // 肌肉数据表异步加载完成后：补一次属性重算（存档恢复早于数据到达时）并刷新面板
    if (typeof document !== 'undefined') {
        document.addEventListener('muscles:data-loaded', function () {
            if (window.CharacterAttributes && typeof window.CharacterAttributes.recalcCharacterStats === 'function' && window.InventoryEquipment) {
                window.CharacterAttributes.recalcCharacterStats({
                    getEquipmentState: function () { return window.InventoryEquipment.getState().equipment; },
                    getSkillsState: function () { return window.InventoryEquipment.getState().skills; },
                    getItemTemplate: window.InventoryEquipment.getItemTemplate,
                    getEnchantEntry: window.InventoryEquipment.getEnchantEntry,
                    getStrengthLevel: function () { return window.InventoryEquipment.getSkillLevel('survival_strength'); }
                });
            }
            if (typeof window.SceneStatusPanel.updateStatusPanel === 'function') SceneHud.refresh('status');
            if (window.CombatPanel.combatPanelOpen) window.CombatPanel.renderCombatModal();
        });
    }
    }

    window.SkillOverview = {
        initialize: initialize,
        bind: bind,
        get LIFE_SKILL_TABLE() { return LIFE_SKILL_TABLE; },
        addSkillLevelGeneric: addSkillLevelGeneric,
        closeSurvivalPanel: closeSurvivalPanel,
        get currentSkillOverviewTab() { return currentSkillOverviewTab; },
        set currentSkillOverviewTab(value) { currentSkillOverviewTab = value; },
        openSurvivalPanel: openSurvivalPanel,
        renderSurvivalModal: renderSurvivalModal,
        get survivalPanelOpen() { return survivalPanelOpen; }
    };
})(window);
