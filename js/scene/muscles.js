/**
 * MusclePanel — 肌肉图谱入口、解剖学门槛与动力链装配展示。
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var opened = false, atlas = null, returnFocus = null;

    function isAvailable() {
        var IE = window.InventoryEquipment;
        var id = IE && IE.SPECIAL_MERIDIAN_STUDIES_SKILL_ID || 'special_meridian_studies';
        return !!(IE && IE.getSkillLevel(id) >= 1);
    }

    function syncAvailability() {
        var available = isAvailable(), button = document.getElementById('btn-muscles');
        // The Svelte navigation owns its button; both views read this same gate.
        if (button && button.dataset.uiOwner !== 'svelte') button.hidden = !available;
        if (opened && (!available || (window.Survival && window.Survival.isDead()))) close({ automatic: true });
        else if (atlas) atlas.refresh();
    }

    function equip(slot, passive) {
        if (!opened || !isAvailable() || window.SceneAccess.isPlayerComaActive() || (window.Survival && window.Survival.isDead())) return { ok: false };
        var result = window.Muscles.setChainPassive(slot, passive);
        if (result.ok) window.SceneHud.refresh('status');
        return result;
    }

    function open() {
        if (opened || !isAvailable() || window.SceneAccess.isPreCreationGameplayRestricted()
            || window.SceneAccess.guardPlayerComaBlocked() || (window.DeathSystem && window.DeathSystem.blocked())) return false;
        var modal = document.getElementById('modal-muscles');
        if (!modal || !window.MuscleAtlasView) return false;
        // Same opening/closing time rule as the existing combat muscle page.
        if (window.Survival) window.Survival.advanceTick();
        if (!isAvailable() || window.SceneAccess.isPlayerComaActive() || (window.Survival && window.Survival.isDead())) return false;
        returnFocus = document.activeElement;
        opened = true;
        var texts = new Proxy({}, { get: function (_, key) { return window.UIText ? window.UIText.t(key) : key; } });
        atlas = window.MuscleAtlasView.create({ host: modal.querySelector('.muscle-atlas-host'), M: window.Muscles, texts: texts, onClose: close, onEquip: equip });
        modal.classList.add('show');
        modal.querySelector('[data-close]').focus();
        return true;
    }

    function close(options) {
        if (!opened) return;
        opened = false;
        if (atlas) atlas.destroy();
        atlas = null;
        document.getElementById('modal-muscles').classList.remove('show');
        if (!options || !options.automatic) {
            if (window.Survival) window.Survival.advanceTick();
        }
        if (returnFocus && returnFocus.isConnected && !returnFocus.hidden) returnFocus.focus();
        returnFocus = null;
    }

    function toggle() { if (opened) close(); else open(); }

    function nativeKeyboard(event) {
        if (!opened || window.SvelteInteractions) return;
        event.stopImmediatePropagation();
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        else if (event.key === 'Tab') {
            var nodes = Array.from(document.querySelectorAll('#modal-muscles button:not(:disabled), #modal-muscles input')).filter(function (n) { return !n.hidden; });
            var index = nodes.indexOf(document.activeElement);
            event.preventDefault();
            nodes[(index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length].focus();
        }
    }

    /** 动力链装配面板（34 §13.28）：列出全部动力链与七部位槽，支持装卸 */
    function renderMusclePassivePanel(isMuscleMode) {
        var panel = document.getElementById('muscle-passive-panel');
        if (!panel) return;
        if (!isMuscleMode) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = 'block';
        panel.innerHTML = '';

        var AP = window.Muscles;
        if (!AP || typeof AP.getPassives !== 'function') return;

        var groups = AP.getChainSlots();
        var groupNameById = {};
        groups.forEach(function (g) { groupNameById[g.id] = g.name; });
        var completed = Object.keys(AP.getPassiveSlots());
        var equippedMap = (AP.getEquippedMap && typeof AP.getEquippedMap === 'function') ? AP.getEquippedMap() : {};
        var passives = AP.getPassives();

        function passiveName(p) {
            return (p.name_key && window.UIText && typeof window.UIText.t === 'function') ? window.UIText.t(p.name_key) : p.id;
        }
        function groupLabel(gid) { return groupNameById[gid] || gid; }

        var header = document.createElement('div');
        header.className = 'mp-header';
        header.textContent = window.SceneFeedback.ui('muscle.passive.title');
        panel.appendChild(header);

        var summary = document.createElement('div');
        summary.className = 'mp-slots-summary';
        summary.textContent = window.SceneFeedback.ui('muscle.passive.slots', { n: String(completed.length), total: String(groups.length) });
        panel.appendChild(summary);

        if (!passives.length) {
            var empty = document.createElement('div');
            empty.className = 'mp-slots-summary';
            empty.textContent = window.SceneFeedback.ui('muscle.passive.empty');
            panel.appendChild(empty);
            return;
        }

        passives.forEach(function (p) {
            if (!p || !p.id) return;
            var isEquipped = false;
            var equippedAt = '';
            for (var g in equippedMap) {
                if (Object.prototype.hasOwnProperty.call(equippedMap, g) && equippedMap[g] === p.id) { isEquipped = true; equippedAt = g; break; }
            }
            var card = document.createElement('div');
            card.className = 'mp-passive' + (isEquipped ? ' mp-equipped' : '');

            var row = document.createElement('div');
            row.className = 'mp-passive-row';
            var nameEl = document.createElement('div');
            nameEl.className = 'mp-passive-name';
            nameEl.textContent = passiveName(p);
            row.appendChild(nameEl);
            var metaEl = document.createElement('div');
            metaEl.className = 'mp-passive-meta';
            var cost = Math.max(1, parseInt(p.slots_cost, 10) || 1);
            var allowedNames = (Array.isArray(p.allowed_slots) ? p.allowed_slots : []).map(groupLabel).join('、');
            metaEl.textContent = window.SceneFeedback.ui('muscle.passive.cost', { n: String(cost) }) + ' · ' + window.SceneFeedback.ui('muscle.passive.allowed', { groups: allowedNames });
            row.appendChild(metaEl);
            card.appendChild(row);

            var descEl = document.createElement('div');
            descEl.className = 'mp-passive-desc';
            descEl.textContent = (p.desc_key && window.UIText && typeof window.UIText.t === 'function') ? window.UIText.t(p.desc_key) : '';
            card.appendChild(descEl);

            var actionRow = document.createElement('div');
            actionRow.className = 'mp-passive-row';
            if (isEquipped) {
                var atEl = document.createElement('div');
                atEl.className = 'mp-passive-meta';
                atEl.textContent = window.SceneFeedback.ui('muscle.passive.equipped_at', { group: groupLabel(equippedAt) });
                actionRow.appendChild(atEl);
                var btnUnequip = document.createElement('button');
                btnUnequip.type = 'button';
                btnUnequip.className = 'mp-btn';
                btnUnequip.textContent = window.SceneFeedback.ui('muscle.passive.unequip');
                btnUnequip.onclick = (function (pid) {
                    return function () {
                        var slot = Object.keys(AP.getEquippedMap()).find(function (id) { return AP.getEquippedMap()[id] === pid; });
                        var r = AP.setChainPassive(slot, null);
                        if (r && r.ok && window.GameLog) {
                            window.GameLog.log(window.SceneFeedback.ui('log.system.muscle.passive_unequipped', { name: passiveName(p) }), 'system');
                        }
                        window.CombatPanel.renderCombatModal();
                    };
                })(p.id);
                actionRow.appendChild(btnUnequip);
            } else {
                // 找第一个可装配的部位槽；多槽条件统一由核心校验。
                var targetGroup = null;
                (Array.isArray(p.allowed_slots) ? p.allowed_slots : []).forEach(function (gid) {
                    if (targetGroup) return;
                    var chk = AP.canEquipPassive(p.id, gid);
                    if (chk && chk.ok) targetGroup = gid;
                });
                var reasonEl = document.createElement('div');
                reasonEl.className = 'mp-passive-meta';
                reasonEl.textContent = (function () {
                    var eqMap = AP.getEquippedMap ? AP.getEquippedMap() : {};
                    for (var gx in eqMap) { if (Object.prototype.hasOwnProperty.call(eqMap, gx) && eqMap[gx] === p.id) return window.SceneFeedback.ui('muscle.passive.already_equipped'); }
                    var anyOccupied = false;
                    var anyNotComplete = false;
                    var anyOk = false;
                    var allowedArr = Array.isArray(p.allowed_slots) ? p.allowed_slots : [];
                    for (var ai = 0; ai < allowedArr.length; ai++) {
                        var chk = AP.canEquipPassive(p.id, allowedArr[ai]);
                        if (!chk) continue;
                        if (chk.ok) { anyOk = true; break; }
                        if (chk.reason === 'slot_occupied') anyOccupied = true;
                        if (chk.reason === 'slot_not_complete') anyNotComplete = true;
                    }
                    if (anyOk) return '';
                    if (anyOccupied) return window.SceneFeedback.ui('muscle.passive.slot_occupied');
                    if (anyNotComplete) return window.SceneFeedback.ui('muscle.passive.need_group', { groups: allowedNames });
                    return window.SceneFeedback.ui('muscle.passive.need_group', { groups: allowedNames });
                })();
                actionRow.appendChild(reasonEl);
                var btnEquip = document.createElement('button');
                btnEquip.type = 'button';
                btnEquip.className = 'mp-btn';
                btnEquip.textContent = window.SceneFeedback.ui('muscle.passive.equip');
                btnEquip.disabled = !targetGroup;
                if (targetGroup) {
                    btnEquip.onclick = (function (pid, gid) {
                        return function () {
                            var r = AP.setChainPassive(gid, pid);
                            if (r && r.ok && window.GameLog) {
                                window.GameLog.log(window.SceneFeedback.ui('log.system.muscle.passive_equipped', { name: passiveName(p), group: groupLabel(gid) }), 'system');
                            }
                            window.CombatPanel.renderCombatModal();
                        };
                    })(p.id, targetGroup);
                }
                actionRow.appendChild(btnEquip);
            }
            card.appendChild(actionRow);
            panel.appendChild(card);
        });
    }

    function initialize() {

    }

    function bind() {
        var button = document.getElementById('btn-muscles'), modal = document.getElementById('modal-muscles');
        if (button) button.addEventListener('click', toggle);
        if (modal) modal.addEventListener('click', function (event) { if (event.target === modal) close(); });
        window.addEventListener('keydown', nativeKeyboard, true);
        window.SceneHud.subscribe('status', syncAvailability);
        document.addEventListener('muscles:data-loaded', syncAvailability);
        syncAvailability();
    }

    window.MusclePanel = {
        isAvailable: isAvailable,
        isOpen: function () { return opened; },
        open: open,
        close: close,
        toggle: toggle,
        equip: equip,
        initialize: initialize,
        bind: bind,
        renderMusclePassivePanel: renderMusclePassivePanel
    };
})(window);
