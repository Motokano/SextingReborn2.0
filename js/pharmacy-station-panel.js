/**
 * PharmacyStationPanel — 制药站面板 DOM（scene-app 组合根化拆解 ②）
 *
 * 来源：自 js/scene-app.js 迁出（pharmacy 面板族：渲染/开合/事件绑定 + UI 态变量）。
 * 依赖注入 setUiDeps({ ui, showMsg, render, tryPharmacyAtStation, tryCompoundAtStation,
 *   isPreCreationGameplayRestricted, showIntroBlockedMsg, guardPlayerComaBlocked })。
 * 状态/规则在 PharmacyStation/StationCraftCore/InventoryHelpers/StationContext；本模块只管 DOM。
 */
(function (global) {
    'use strict';

    var IE = global.InventoryEquipment;

    var pharmacyStationPanelOpen = false;
    var pharmacyStationUiState = {
        method_id: '',
        inputs: [],
        /** 47 §9.4 配药模式（k231）：true = 投料走配药结算，不走固定配方行 */
        compound_mode: false
    };
    var libraryView = 'materials';
    var equipmentOpen = false;
    var resolvedWearResult = null;
    var dismissedCraftResult = null;
    var staminaUnsubscribe = null;
    // An optional view keeps unfinished medicine enhancement confined to its prototype.
    var enhancementView = null;
    var enhancementMode = false;

    var uiDeps = {};
    function setUiDeps(deps) {
        if (deps && typeof deps === 'object') uiDeps = Object.assign({}, uiDeps, deps);
    }
    function ui(key, vars) {
        return (typeof uiDeps.ui === 'function') ? uiDeps.ui(key, vars) : (key != null ? String(key) : '');
    }
    function showMsg(text, kind) {
        if (typeof uiDeps.showMsg === 'function') uiDeps.showMsg(text, kind);
    }
    function renderScene() {
        if (typeof uiDeps.render === 'function') uiDeps.render();
    }
    function tryPharmacyAtStation(mid, inputs) {
        return (typeof uiDeps.tryPharmacyAtStation === 'function') ? uiDeps.tryPharmacyAtStation(mid, inputs) : { ok: false, reason: 'missing_di' };
    }

    /** 配药结算入口（47 §9.4；scene-app 注入）。 */
    function tryCompoundAtStation(inputs) {
        return (typeof uiDeps.tryCompoundAtStation === 'function') ? uiDeps.tryCompoundAtStation(inputs) : { ok: false, reason: 'missing_di' };
    }

    /** 配药模式规则（浓度条等；模块缺失时返回 null）。 */
    function getCompounding() {
        return global.PharmacyCompounding || null;
    }

    function isInjectionUnlocked() {
        var pc = getCompounding();
        return !!(pc && typeof pc.isUnlocked === 'function' && pc.isUnlocked());
    }

    function resetLockedCompoundMode() {
        if (!pharmacyStationUiState.compound_mode || isInjectionUnlocked()) return false;
        pharmacyStationUiState.compound_mode = false;
        pharmacyStationUiState.inputs = [];
        libraryView = 'materials';
        return true;
    }

    /**
     * 配药模式 UI 容器（惰性创建，插在状态区之前）：模式切换 + 浓度条。
     * 配伍判断按制药等级解锁；可见异常与已试同份数组合常驻。
     */
    function ensureCompoundBar(modal) {
        if (!modal) return null;
        var bar = document.getElementById('pharmacy-compound-bar');
        if (bar) return bar;
        // 状态区 id 在 index.html 为 pharmacy-status-kv（历史面板代码曾写 pharmacy-kv，双查兜底）
        var anchor = document.getElementById('pharmacy-status-kv') || document.getElementById('pharmacy-kv');
        if (!anchor || !anchor.parentNode) return null;
        bar = document.createElement('div');
        bar.id = 'pharmacy-compound-bar';
        bar.className = 'pharmacy-compound-bar';
        anchor.parentNode.insertBefore(bar, anchor);
        return bar;
    }

    function isEnhancementUnlocked() {
        return !!(enhancementView && enhancementView.isUnlocked());
    }
    function getUpgradeProject() {
        var id = enhancementView && enhancementView.stationProjectId;
        return id && global.FacilityUnlock ? global.FacilityUnlock.get(id) : null;
    }
    function selectMode(mode) {
        if (!pharmacyStationPanelOpen || ['craft', 'compound', 'enhance'].indexOf(mode) < 0) return false;
        if (mode === 'compound' && !isInjectionUnlocked() || mode === 'enhance' && !isEnhancementUnlocked()) return false;
        enhancementMode = mode === 'enhance';
        if (!enhancementMode) { pharmacyStationUiState.compound_mode = mode === 'compound'; libraryView = 'materials'; }
        renderPharmacyStationPanel();
        return true;
    }
    function getMode() { return enhancementMode ? 'enhance' : pharmacyStationUiState.compound_mode ? 'compound' : 'craft'; }
    function setEnhancementView(view) {
        if (enhancementView) enhancementView.hide();
        enhancementView = view || null;
        if (!isEnhancementUnlocked()) enhancementMode = false;
        if (pharmacyStationPanelOpen) renderPharmacyStationPanel();
    }
    function renderModeTabs() {
        var toggleWrap = document.getElementById('pharmacy-mode-tabs');
        if (!toggleWrap) return;
        toggleWrap.innerHTML = '';
        var visible = isInjectionUnlocked() || !!enhancementView;
        toggleWrap.hidden = !visible;
        toggleWrap.style.display = visible ? '' : 'none';
        if (!visible) return;
        var mkBtn = function (label, mode) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn-method' + (getMode() === mode ? ' active' : '');
            b.dataset.pharmacyMode = mode;
            b.textContent = label;
            b.setAttribute('aria-pressed', String(getMode() === mode));
            b.onclick = function () {
                if (!selectMode(mode)) renderPharmacyStationPanel();
            };
            return b;
        };
        toggleWrap.appendChild(mkBtn(ui('pharmacy.mode.craft'), 'craft'));
        if (isInjectionUnlocked()) toggleWrap.appendChild(mkBtn(ui('pharmacy.mode.compound'), 'compound'));
        if (isEnhancementUnlocked()) toggleWrap.appendChild(mkBtn(ui('pharmacy.mode.enhance'), 'enhance'));
    }
    function renderCompoundBar() {
        var modal = document.getElementById('modal-pharmacy-station');
        var bar = ensureCompoundBar(modal);
        if (!bar) return;
        bar.innerHTML = '';
        var PC = getCompounding();
        bar.hidden = !isInjectionUnlocked();
        if (bar.hidden) return;

        if (!pharmacyStationUiState.compound_mode || !pharmacyStationUiState.inputs.length) return;
        var info = (PC && typeof PC.getConcentrationInfo === 'function')
            ? PC.getConcentrationInfo(pharmacyStationUiState.inputs || [])
            : { used: 0, capacity: 0, ratio: 0, solvent_count: 0 };
        var line = document.createElement('div');
        line.className = 'kv' + (info.used > info.capacity ? ' bad' : '');
        line.textContent = ui('pharmacy.compound.concentration', {
            used: String(info.used),
            capacity: String(info.capacity),
            solvent: String(info.solvent_count)
        });
        bar.appendChild(line);
        var track = document.createElement('div');
        track.style.cssText = 'height:8px;background:#292524;border-radius:4px;overflow:hidden;margin:4px 0 8px;';
        var fill = document.createElement('div');
        fill.style.cssText = 'height:100%;width:' + Math.round((info.ratio || 0) * 100) + '%;background:' + (info.used > info.capacity ? '#dc2626' : '#22c55e') + ';';
        track.appendChild(fill);
        bar.appendChild(track);

        var level = IE && typeof IE.getSkillLevel === 'function' ? IE.getSkillLevel('life_pharmacy') : 0;
        var assessment = PC && PC.assess ? PC.assess(pharmacyStationUiState.inputs || [], level) : null;
        function infoLine(key, vars, bad) {
            var el = document.createElement('div');
            el.className = 'kv' + (bad ? ' bad' : '');
            el.textContent = ui(key, vars);
            bar.appendChild(el);
        }
        if (assessment && assessment.ok) {
            infoLine(assessment.visible_abnormality ? 'pharmacy.assess.visible' : 'pharmacy.assess.clear', {}, assessment.visible_abnormality);
            var salt = assessment.salt;
            if (salt && salt.required > 0) infoLine(salt.precipitated ? 'pharmacy.compound.salt_precipitated' : 'pharmacy.compound.salt_ok', { need: salt.required, have: salt.provided, miss: salt.deficit }, salt.precipitated);
            assessment.conflicts.forEach(function (c) {
                var pair = c.items.map(function (id) { return StationCraftCore.getItemDisplayNameSafe(id); }).join(' + ');
                infoLine('pharmacy.assess.' + (c.outcome || 'conflict'), { pair: pair }, true);
                if (c.suggestion) infoLine('pharmacy.assess.suggest_' + c.suggestion);
            });
            if (assessment.net_toxicity != null) infoLine('pharmacy.assess.toxicity', { n: assessment.net_toxicity });
            if (assessment.effects.length) {
                var details = document.createElement('details');
                var summary = document.createElement('summary');
                summary.textContent = ui('pharmacy.action.details');
                details.appendChild(summary);
                assessment.effects.forEach(function (e) {
                    var detail = document.createElement('div');
                    detail.className = 'kv';
                    detail.textContent = ui('pharmacy.assess.effect', { name: e.name, onset: e.onset, duration: e.duration });
                    if (e.detail) detail.textContent += ' · ' + e.detail;
                    details.appendChild(detail);
                });
                bar.appendChild(details);
            }
            if (!assessment.comprehensive) infoLine('pharmacy.assess.unknown');
        } else if (assessment && pharmacyStationUiState.inputs.length) {
            infoLine(pharmacyStartReasonToMsgKey(assessment.reason), {}, true);
        }

    }
    function isPreCreationGameplayRestricted() {
        return (typeof uiDeps.isPreCreationGameplayRestricted === 'function') ? !!uiDeps.isPreCreationGameplayRestricted() : false;
    }
    function showIntroBlockedMsg() {
        if (typeof uiDeps.showIntroBlockedMsg === 'function') uiDeps.showIntroBlockedMsg();
    }
    function guardPlayerComaBlocked() {
        return (typeof uiDeps.guardPlayerComaBlocked === 'function') ? !!uiDeps.guardPlayerComaBlocked() : false;
    }
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
                if (!StationCraftCore.isItemAllowedPharmacyIngredient(id)) continue;
                // 配药模式（k231）：只列药粉/溶媒/助剂（生药材需先粉碎成药粉）
                if (pharmacyStationUiState.compound_mode) {
                    var PC = getCompounding();
                    if (PC && typeof PC.isComponentTemplate === 'function' && !PC.isComponentTemplate(IE && IE.getItemTemplate ? IE.getItemTemplate(id) : null)) continue;
                }
                if (global.InventoryHelpers.getInventoryCountByItemId(id) <= 0) continue;
                seen[id] = true;
                out.push(id);
            }
        }
        out.sort();
        return out;
    }

    function setPharmacyMethodId(mid) {
        pharmacyStationUiState.method_id = (mid != null) ? String(mid) : '';
    }

    function setPharmacyInputs(list) {
        pharmacyStationUiState.inputs = StationCraftCore.normalizePharmacyInputs(list || []);
    }

    function changePharmacyInputCount(itemId, value) {
        var have = global.InventoryHelpers.getInventoryCountByItemId(itemId);
        var count = Math.max(1, Math.min(Math.max(1, have), Math.floor(Number(value) || 1)));
        var inputs = StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
        inputs.forEach(function (entry) { if (entry.item_id === itemId) entry.count = count; });
        setPharmacyInputs(inputs);
        renderPharmacyStationPanel();
    }

    function getStagedPharmacyCountForItem(itemId) {
        var arr = StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
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
        if (!StationCraftCore.isItemAllowedPharmacyIngredient(iid)) {
            showMsg(ui('pharmacy.try.fail.not_ingredient', { item: iid }), 'info');
            return;
        }
        var have = global.InventoryHelpers.getInventoryCountByItemId(iid);
        var staged = getStagedPharmacyCountForItem(iid);
        if (have <= 0 || staged >= have) {
            showMsg(ui('pharmacy.try.fail.missing_inputs', { item: StationCraftCore.getItemDisplayNameSafe(iid) }), 'info');
            return;
        }
        var arr = StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
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
            var disp = StationCraftCore.getItemDisplayNameSafe(iid);
            if (f && String(iid).toLowerCase().indexOf(f) < 0 && String(disp).toLowerCase().indexOf(f) < 0) continue;
            nShown++;
            var have = global.InventoryHelpers.getInventoryCountByItemId(iid);
            var staged = getStagedPharmacyCountForItem(iid);
            var canAdd = have > 0 && staged < have;
            var row = document.createElement('div');
            row.className = 'cs-ingredient-row';
            var left = document.createElement('div');
            left.className = 'cs-ing-left';
            var nameEl = document.createElement('div');
            nameEl.className = 'cs-ing-name';
            nameEl.textContent = disp;
            left.appendChild(nameEl);
            var countsEl = document.createElement('div');
            countsEl.className = 'cs-ing-counts';
            countsEl.textContent = staged ? ui('pharmacy.ingredient.available_staged_fmt', { have: String(have), staged: String(staged) }) : ui('pharmacy.inputs.available_fmt', { n: have });
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
                        var tipHtml = SceneUi.buildItemTooltipHtmlForTemplate(iid, tpl, null, char0);
                        row.addEventListener('mouseenter', function (h, elRef) { return function () { SceneUi.showItemTooltip(h, elRef); }; }(tipHtml, row));
                        row.addEventListener('mouseleave', SceneUi.hideItemTooltip);
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

    function accessoryMethodsLabel(itemId) {
        var methods = PharmacyStation.getMethods();
        return Object.keys(methods).filter(function (id) {
            return PharmacyStation.getMethodAccessoryIds(id).indexOf(itemId)>=0;
        }).map(function (id) {
            return PharmacyStation.getPharmacyMethodDisplayName(id, methods[id]);
        }).join('、');
    }

    function changePharmacyAccessory(itemId, install) {
        if (!pharmacyStationPanelOpen || pharmacyStationUiState.compound_mode) return;
        var ret = install ? PharmacyStation.installPharmacyAccessoryFromInventory(itemId) : PharmacyStation.uninstallPharmacyAccessoryToInventory(itemId);
        showMsg(ui('pharmacy.accessory.' + (install ? 'install' : 'uninstall') + (ret && ret.ok ? '_ok' : '_fail'), {
            item: StationCraftCore.getItemDisplayNameSafe(itemId)
        }), ret && ret.ok ? 'success' : 'warn');
        renderPharmacyStationPanel();
        SceneHud.refresh('backpack');
        SceneHud.refresh('status');
        if (global.SceneRenderer) global.SceneRenderer.render();
        var toggle = document.getElementById('pharmacy-equipment-toggle');
        if (toggle) toggle.focus();
    }

    function renderPharmacyEquipment(installed, compoundMode) {
        var section = document.getElementById('pharmacy-equipment-section');
        if (!section) return;
        section.hidden = compoundMode;
        var result = PharmacyStation.getLastCraftResult();
        var brokenId = result && result.broken_equipment_id;
        if (brokenId && installed.indexOf(brokenId) >= 0) resolvedWearResult = result;
        var needsReplacement = !!brokenId && result !== resolvedWearResult;
        section.setAttribute('data-state', needsReplacement ? 'broken' : installed.length ? 'ready' : 'empty');
        var status = document.getElementById('pharmacy-equipment-status');
        if (status) status.textContent = needsReplacement
            ? ui('pharmacy.equipment.broken', { item: StationCraftCore.getItemDisplayNameSafe(brokenId) })
            : installed.length ? installed.map(StationCraftCore.getItemDisplayNameSafe).join('、') : ui('pharmacy.equipment.none');
        var toggle = document.getElementById('pharmacy-equipment-toggle');
        if (toggle) {
            toggle.textContent = ui(needsReplacement ? 'pharmacy.equipment.reinstall' : installed.length ? 'pharmacy.equipment.manage' : 'pharmacy.action.install');
            toggle.setAttribute('aria-label', toggle.textContent);
            toggle.setAttribute('aria-expanded', String(equipmentOpen && !compoundMode));
        }
        var panel = document.getElementById('pharmacy-equipment');
        if (panel) panel.hidden = !equipmentOpen || compoundMode;
        var installedSection = document.getElementById('pharmacy-installed-section');
        if (installedSection) installedSection.hidden = !installed.length;

        function appendEquipment(wrap, itemId, availableCount) {
            var install = availableCount != null;
            var row = document.createElement('div');
            row.className = 'cs-input-row pharmacy-device-row';
            row.setAttribute('data-equipment-id', itemId);
            var identity = document.createElement('div');
            identity.className = 'pharmacy-device-identity';
            var name = document.createElement('strong');
            name.textContent = StationCraftCore.getItemDisplayNameSafe(itemId);
            var methods = document.createElement('span');
            methods.className = 'pharmacy-device-methods';
            methods.textContent = '→ ' + accessoryMethodsLabel(itemId);
            identity.appendChild(name);
            identity.appendChild(methods);
            var action = document.createElement('div');
            action.className = 'pharmacy-device-action';
            if (install) {
                var stock = document.createElement('span');
                stock.textContent = '×' + availableCount;
                action.appendChild(stock);
            }
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn-mini ' + (install ? 'pharmacy-install-device' : 'pharmacy-uninstall-device');
            button.textContent = ui(install ? 'pharmacy.btn.install_accessory' : 'pharmacy.equipment.uninstall');
            button.setAttribute('aria-label', ui(install ? 'pharmacy.equipment.install_named' : 'pharmacy.equipment.uninstall_named', { item: name.textContent }));
            button.disabled = !install && PharmacyStation.isAccessoryInUse(itemId);
            if (button.disabled) button.title = ui('pharmacy.accessory.in_use');
            button.onclick = function () { changePharmacyAccessory(itemId, install); };
            action.appendChild(button);
            row.appendChild(identity);
            row.appendChild(action);
            wrap.appendChild(row);
        }
        var installedList = document.getElementById('pharmacy-accessory-list');
        if (installedList) {
            installedList.innerHTML = '';
            installed.forEach(function (id) { appendEquipment(installedList, id, null); });
        }
        var availableList = document.getElementById('pharmacy-available-accessories');
        if (availableList) {
            availableList.innerHTML = '';
            var available = PharmacyStation.getPharmacyAccessoryOptionsFromInventory(installed);
            // Keep the broken device first when a replacement is in the backpack.
            if (needsReplacement) available.sort(function (a, b) { return Number(b.item_id === brokenId) - Number(a.item_id === brokenId); });
            available.forEach(function (item) { appendEquipment(availableList, item.item_id, item.count); });
            if (!available.length) {
                var empty = document.createElement('p');
                empty.className = 'pharmacy-equipment-empty';
                empty.textContent = ui('pharmacy.equipment.no_available');
                availableList.appendChild(empty);
            }
        }
    }

    // Same reading, tone and metric/track presentation used by the main HUD.
    function renderPharmacyStamina() {
        var meter = document.getElementById('pharmacy-stamina-meter');
        var text = document.getElementById('pharmacy-stamina-text');
        var bar = document.getElementById('pharmacy-stamina-bar');
        if (!meter || !text || !bar) return;
        var state = global.Survival && global.Survival.getState ? global.Survival.getState() : null;
        var wrap = document.getElementById('pharmacy-stamina');
        if (wrap) wrap.hidden = !state;
        if (!state) return;
        var current = Math.max(0, Number(state.stamina) || 0);
        var max = Math.max(1, Number(state.stamina_max) || 100);
        text.textContent = String(Number(current.toFixed(1))) + ' ';
        var maximum = document.createElement('small');
        maximum.textContent = '/ ' + Number(max.toFixed(1));
        text.appendChild(maximum);
        text.className = 'value ' + (current <= 0 ? 'danger' : current < max * 0.3 ? 'warn' : 'ok');
        bar.style.width = Math.min(100, current / max * 100) + '%';
        meter.setAttribute('aria-valuemax', String(max));
        meter.setAttribute('aria-valuenow', String(Math.min(max, current)));
    }

    function renderPharmacyStationPanel() {
        resetLockedCompoundMode();
        var modal = document.getElementById('modal-pharmacy-station');
        if (!modal) return;
        if (enhancementMode && !isEnhancementUnlocked()) enhancementMode = false;
        renderModeTabs();
        var normalBody = modal.querySelector('.cs-body'), normalFooter = modal.querySelector('.pharmacy-footer');
        if (normalBody) normalBody.hidden = enhancementMode;
        if (normalFooter) normalFooter.hidden = enhancementMode;
        if (enhancementMode) { enhancementView.render(); return; }
        if (enhancementView) enhancementView.hide();
        var methodWrap = document.getElementById('pharmacy-method-list');
        var listEl = document.getElementById('pharmacy-input-list');
        var knownWrap = document.getElementById('pharmacy-known-list');
        var kvWrap = document.getElementById('pharmacy-status-kv') || document.getElementById('pharmacy-kv');
        var startBtn = document.getElementById('pharmacy-start-btn');
        var mid = pharmacyStationUiState.method_id ? String(pharmacyStationUiState.method_id) : '';
        var compoundMode = !!pharmacyStationUiState.compound_mode;
        var availableMethods = Object.keys(PharmacyStation.getMethods()).filter(function (id) {
            return PharmacyStation.isPharmacyMethodUnlockedAtStation(id);
        }).sort();
        if (mid && availableMethods.indexOf(mid) < 0) {
            setPharmacyMethodId('');
            mid = '';
        }
        function visible(id, show) {
            var el = document.getElementById(id);
            if (el) el.hidden = !show;
        }
        visible('pharmacy-method-section', !compoundMode && availableMethods.length > 0);
        visible('pharmacy-recipes-tab', !compoundMode);
        visible('pharmacy-materials-view', compoundMode || libraryView === 'materials');
        visible('pharmacy-recipes-view', !compoundMode && libraryView === 'recipes');
        ['materials', 'recipes'].forEach(function (view) {
            var tab = document.getElementById('pharmacy-' + view + '-tab');
            if (!tab) return;
            tab.className = 'btn-method' + (libraryView === view ? ' active' : '');
            tab.setAttribute('aria-pressed', String(libraryView === view));
            tab.onclick = function () { libraryView = view; renderPharmacyStationPanel(); };
        });

        if (methodWrap) {
            methodWrap.style.display = compoundMode ? 'none' : '';
            methodWrap.innerHTML = '';
            var ids = availableMethods;
            var mi;
            for (mi = 0; mi < ids.length; mi++) {
                var idm = ids[mi];
                var mObj = PharmacyStation.getMethods()[idm];
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-method' + (String(idm) === String(mid) ? ' active' : '');
                var methodName = PharmacyStation.getPharmacyMethodDisplayName(idm, mObj);
                btn.setAttribute('aria-label', methodName);
                btn.setAttribute('aria-pressed', String(String(idm) === String(mid)));
                var methodLabel = document.createElement('span');
                methodLabel.className = 'pharmacy-method-name';
                methodLabel.textContent = methodName;
                btn.appendChild(methodLabel);
                if (mObj.requires_accessory_item_id) {
                    btn.title = StationCraftCore.getItemDisplayNameSafe(mObj.requires_accessory_item_id);
                }
                btn.setAttribute('data-method-id', idm);
                if (compoundMode) { btn.disabled = true; btn.style.opacity = '0.45'; }
                btn.onclick = (function (xid) { return function () {
                    if (PharmacyStation.isPharmacyMethodUnlockedAtStation(xid)) setPharmacyMethodId(xid);
                    renderPharmacyStationPanel();
                }; })(idm);
                methodWrap.appendChild(btn);
            }
            if (!ids.length) {
                var emptyMethods = document.createElement('div');
                emptyMethods.className = 'cs-empty-hint';
                emptyMethods.textContent = ui('pharmacy.methods.empty');
                methodWrap.appendChild(emptyMethods);
            }
        }

        // 投料列表
        if (listEl) {
            listEl.innerHTML = '';
            var selected = StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
            pharmacyStationUiState.inputs = selected;
            var clearButton = document.getElementById('pharmacy-clear-btn');
            if (clearButton) clearButton.disabled = !selected.length;
            if (!selected.length) {
                var emptyInputs = document.createElement('div');
                emptyInputs.className = 'pharmacy-input-empty';
                emptyInputs.textContent = ui('pharmacy.inputs.empty');
                listEl.appendChild(emptyInputs);
            } else {
                for (var ii = 0; ii < selected.length; ii++) {
                    var row = document.createElement('div');
                    row.className = 'cs-input-row pharmacy-input-row';
                    var id0 = selected[ii].item_id;
                    var c0 = parseInt(selected[ii].count, 10) || 1;
                    var nameEl = document.createElement('div');
                    nameEl.className = 'iname';
                    nameEl.textContent = StationCraftCore.getItemDisplayNameSafe(id0);
                    var identity = document.createElement('div');
                    identity.className = 'pharmacy-input-identity';
                    identity.appendChild(nameEl);
                    var available = document.createElement('span');
                    available.className = 'pharmacy-input-stock';
                    var have = global.InventoryHelpers.getInventoryCountByItemId(id0);
                    available.textContent = ui('pharmacy.inputs.available_fmt', { n: have });
                    identity.appendChild(available);
                    var quantity = document.createElement('div');
                    quantity.className = 'pharmacy-quantity';
                    var cntEl = document.createElement('input');
                    cntEl.type = 'number';
                    cntEl.min = '1';
                    cntEl.max = String(Math.max(1, have));
                    cntEl.step = '1';
                    cntEl.inputMode = 'numeric';
                    cntEl.className = 'icnt';
                    cntEl.value = c0;
                    cntEl.setAttribute('aria-label', ui('pharmacy.action.quantity', { item: nameEl.textContent }));
                    cntEl.onchange = (function (rid, input) {
                        return function () {
                            changePharmacyInputCount(rid, input.value);
                        };
                    })(id0, cntEl);
                    [-1, 1].forEach((function (rid, current, stock, input, group, name) {
                        return function (delta) {
                            var stepButton = document.createElement('button');
                            stepButton.type = 'button';
                            stepButton.className = 'pharmacy-quantity-step';
                            stepButton.textContent = delta < 0 ? '−' : '+';
                            stepButton.setAttribute('aria-label', ui(delta < 0 ? 'pharmacy.quantity.decrease' : 'pharmacy.quantity.increase', { item: name }));
                            stepButton.disabled = delta < 0 ? current <= 1 : current >= stock;
                            stepButton.onclick = function () { changePharmacyInputCount(rid, Number(input.value) + delta); };
                            if (delta > 0) {
                                group.appendChild(input);
                            }
                            group.appendChild(stepButton);
                        };
                    })(id0, c0, have, cntEl, quantity, nameEl.textContent));
                    var btnDel = document.createElement('button');
                    btnDel.type = 'button';
                    btnDel.className = 'btn-mini pharmacy-remove-input';
                    btnDel.textContent = ui('pharmacy.btn.remove');
                    btnDel.onclick = (function (rid) {
                        return function () {
                            var arr = StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
                            var out = [];
                            for (var k = 0; k < arr.length; k++) if (String(arr[k].item_id) !== String(rid)) out.push(arr[k]);
                            setPharmacyInputs(out);
                            renderPharmacyStationPanel();
                        };
                    })(id0);
                    row.appendChild(identity);
                    row.appendChild(quantity);
                    row.appendChild(btnDel);
                    listEl.appendChild(row);
                }
            }
        }

        renderPharmacyIngredientPickerList();

        var csAcc = PharmacyStation.getState();
        var installed = Array.isArray(csAcc.installed_accessory_item_ids) ? csAcc.installed_accessory_item_ids.slice() : [];
        renderPharmacyEquipment(installed, compoundMode);

        // 已知配方快捷填材（可选）
        if (knownWrap) {
            knownWrap.style.display = compoundMode ? 'none' : '';
            knownWrap.innerHTML = '';
            var knownIds = (global.SceneApp && typeof global.SceneApp.getKnownPharmacyRecipeIds === 'function') ? global.SceneApp.getKnownPharmacyRecipeIds() : [];
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
                    for (rr = 0; rr < PharmacyStation.getRecipes().length; rr++) {
                        if (String(PharmacyStation.getRecipes()[rr].recipe_id) === legacyRecipeKey) { rec = PharmacyStation.getRecipes()[rr]; break; }
                    }
                    if (!rec) {
                        for (rr = 0; rr < PharmacyStation.getRecipes().length; rr++) {
                            if (String(PharmacyStation.getRecipes()[rr].recipe_id) === String(rid)) { rec = PharmacyStation.getRecipes()[rr]; break; }
                        }
                    }
                    if (!rec) continue;
                    var btnK = document.createElement('button');
                    btnK.type = 'button';
                    btnK.className = 'btn-known';
                    var output = rec.main_output || {};
                    var outputId = Array.isArray(output) ? output[0] : output.item_id;
                    var outputCount = Math.max(1, parseInt(Array.isArray(output) ? output[1] : output.count, 10) || 1);
                    var rName = StationCraftCore.getItemDisplayNameSafe(outputId);
                    if (!rName || rName === outputId) rName = ui('pharmacy.known.unnamed');
                    var title = document.createElement('span');
                    title.style.cssText = 'display:block;font-size:14px;line-height:1.5';
                    title.textContent = rName + ' ×' + outputCount;
                    var recipeMethod = String(rec.method_id || rec.required_method || '');
                    var method = PharmacyStation.getMethods()[recipeMethod];
                    var canSelect = PharmacyStation.isPharmacyMethodUnlockedAtStation(recipeMethod);
                    var meta = document.createElement('span');
                    meta.style.cssText = 'display:block;margin-top:4px;font-weight:400;font-size:12px;color:#bcb3a4;line-height:1.5';
                    meta.textContent = method ? PharmacyStation.getPharmacyMethodDisplayName(recipeMethod, method) : '';
                    if (!canSelect) meta.textContent += (meta.textContent ? ' · ' : '') + (method && method.requires_accessory_item_id
                        ? ui('pharmacy.known.requires_equipment', { item: StationCraftCore.getItemDisplayNameSafe(method.requires_accessory_item_id) })
                        : ui('pharmacy.action.locked'));
                    btnK.disabled = !canSelect;
                    btnK.setAttribute('data-recipe-id', String(rec.recipe_id));
                    btnK.appendChild(title);
                    btnK.appendChild(meta);
                    btnK.onclick = (function (rx) {
                        return function () {
                            if (!PharmacyStation.isPharmacyMethodUnlockedAtStation(rx.method_id || rx.required_method)) {
                                renderPharmacyStationPanel(); return;
                            }
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
        renderCompoundBar();
        var mSel = (PharmacyStation.getMethods() && mid && PharmacyStation.getMethods()[String(mid)]) ? PharmacyStation.getMethods()[String(mid)] : null;
        var needStamina = mSel ? StationCraftCore.readMethodCostValue(mSel, 'stamina', 'stamina_cost') : 0;
        var craftPreview = (!compoundMode && mid && typeof PharmacyStation.getCraftPreview === 'function')
            ? PharmacyStation.getCraftPreview(mid, pharmacyStationUiState.inputs || []) : null;
        if (craftPreview && craftPreview.ok) {
            needStamina = craftPreview.cost.stamina;
        }
        if (global.Survival && global.Survival.getActionStaminaCost) needStamina = global.Survival.getActionStaminaCost(needStamina);
        var survState = global.Survival && typeof global.Survival.getState === 'function' ? global.Survival.getState() : null;
        var curStamina = survState ? Number(survState.stamina || 0) : 0;
        renderPharmacyStamina();
        var activeCraft = PharmacyStation.getActiveCraft();
        var resultWrap = document.getElementById('pharmacy-result');
        if (resultWrap) {
            var result = PharmacyStation.getLastCraftResult();
            var showResult = !!result && result !== dismissedCraftResult && !activeCraft && (result.mode !== 'compound' || isInjectionUnlocked());
            resultWrap.hidden = !showResult;
            resultWrap.innerHTML = '';
            if (showResult) {
                resultWrap.setAttribute('data-success', String(result.success));
                var resultTitle = document.createElement('h3');
                resultTitle.textContent = ui(result.success ? 'pharmacy.result.success' : 'pharmacy.result.failure');
                resultWrap.appendChild(resultTitle);
                var dismissResult = document.createElement('button');
                dismissResult.type = 'button';
                dismissResult.className = 'pharmacy-result-close';
                dismissResult.textContent = '×';
                dismissResult.setAttribute('aria-label', ui('pharmacy.result.close'));
                dismissResult.title = ui('pharmacy.result.close');
                dismissResult.onclick = function () {
                    dismissedCraftResult = result;
                    renderPharmacyStationPanel();
                    var focusTarget = document.getElementById('pharmacy-start-btn');
                    if (!focusTarget || focusTarget.disabled) focusTarget = document.getElementById('pharmacy-materials-tab');
                    if (focusTarget) focusTarget.focus();
                };
                resultWrap.appendChild(dismissResult);
                result.outputs.forEach(function (output) {
                    var row = document.createElement('div');
                    row.className = 'pharmacy-result-row';
                    var item = document.createElement('strong');
                    item.textContent = StationCraftCore.getItemDisplayNameSafe(output.item_id) + ' ×' + output.count;
                    var destination = document.createElement('span');
                    destination.textContent = ui(output.destination === 'ground' ? 'pharmacy.result.ground' : 'pharmacy.result.inventory');
                    row.appendChild(item);
                    row.appendChild(destination);
                    resultWrap.appendChild(row);
                });
                if (!result.outputs.length) {
                    var none = document.createElement('div');
                    none.textContent = ui('pharmacy.result.empty');
                    resultWrap.appendChild(none);
                }
                if (result.broken_equipment_id) {
                    var wearNote = document.createElement('div');
                    wearNote.className = 'pharmacy-result-wear';
                    wearNote.textContent = ui('pharmacy.result.equipment_broken', { item: StationCraftCore.getItemDisplayNameSafe(result.broken_equipment_id) });
                    resultWrap.appendChild(wearNote);
                }
            }
        }
        var progressWrap = document.getElementById('pharmacy-active-craft');
        if (progressWrap) {
            progressWrap.innerHTML = '';
            if (activeCraft) {
                var progress = document.createElement('progress');
                progress.setAttribute('aria-label', ui('pharmacy.section.progress'));
                var time = global.GameTime && global.GameTime.getState ? global.GameTime.getState() : null;
                if (time && typeof time.totalTicks === 'number' && typeof activeCraft.started_total_ticks === 'number') {
                    var elapsed = Math.max(0, time.totalTicks - activeCraft.started_total_ticks);
                    progress.max = Math.max(1, elapsed + activeCraft.remaining_ticks);
                    progress.value = elapsed;
                }
                progressWrap.appendChild(progress);
            }
        }
        if (kvWrap) {
            kvWrap.innerHTML = '';
            if (!compoundMode && mSel) {
                if (mSel.requires_accessory_item_id) {
                    var breakChance = activeCraft && activeCraft.equipment_wear ? activeCraft.equipment_wear.chance : PharmacyStation.getEquipmentBreakChance();
                    var risk = document.createElement('div');
                    risk.className = 'pharmacy-equipment-risk';
                    var riskLabel = document.createElement('span');
                    riskLabel.textContent = ui('pharmacy.equipment.risk') + ' ';
                    var riskValue = document.createElement('strong');
                    riskValue.textContent = Number((breakChance * 100).toFixed(2)) + '%';
                    risk.appendChild(riskLabel);
                    risk.appendChild(riskValue);
                    kvWrap.appendChild(risk);
                }
            }
        }
        var previewWrap = document.getElementById('pharmacy-preview');
        if (previewWrap) {
            previewWrap.innerHTML = '';
            if (!compoundMode && craftPreview && craftPreview.ok) {
                [ui('pharmacy.kv.standard_output', { item: StationCraftCore.getItemDisplayNameSafe(craftPreview.output.item_id), n: craftPreview.output.count || 1 }),
                    ui('pharmacy.kv.success_rate', { n: Math.round(craftPreview.success_rate * 100) }),
                    ui('pharmacy.kv.recommended_level', { recommended: craftPreview.recommended_skill_level, current: craftPreview.current_skill_level })].forEach(function (text) {
                    var line = document.createElement('div'); line.className = 'kv'; line.textContent = text; previewWrap.appendChild(line);
                });
            }
        }


        var inputs = StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
        var blocked = '';
        if (activeCraft) blocked = ui('pharmacy.action.working');
        else if (!compoundMode && !availableMethods.length) { blocked = ui('pharmacy.methods.empty'); }
        else if (!compoundMode && !mSel) blocked = ui('pharmacy.action.method');
        else if (!inputs.length) blocked = ui('pharmacy.action.inputs');
        else if (compoundMode) {
            var PC = getCompounding();
            var check = PC ? PC.validate(inputs) : { ok: false, reason: 'compounding_unavailable' };
            if (!check.ok) {
                var concentration = PC && PC.getConcentrationInfo ? PC.getConcentrationInfo(inputs) : {};
                blocked = ui(pharmacyStartReasonToMsgKey(check.reason), {
                    item: StationCraftCore.getItemDisplayNameSafe(check.item_id || ''),
                    used: concentration.used, capacity: concentration.capacity
                });
            }
        }
        if (!blocked) {
            for (var ci = 0; ci < inputs.length; ci++) {
                if (global.InventoryHelpers.getInventoryCountByItemId(inputs[ci].item_id) < inputs[ci].count) {
                    blocked = ui('pharmacy.action.missing', { item: StationCraftCore.getItemDisplayNameSafe(inputs[ci].item_id) }); break;
                }
            }
        }
        if (!blocked && !compoundMode) {
            if (mSel.requires_accessory_item_id && installed.indexOf(mSel.requires_accessory_item_id) < 0) {
                blocked = ui('pharmacy.action.accessory', { item: StationCraftCore.getItemDisplayNameSafe(mSel.requires_accessory_item_id) });
            } else if (curStamina < needStamina) blocked = ui('pharmacy.action.stamina');
        }
        var status = document.getElementById('pharmacy-action-status');
        if (status) status.textContent = blocked;
        var okStart = !blocked;
        if (startBtn) {
            startBtn.disabled = !okStart;
            startBtn.textContent = compoundMode ? ui('pharmacy.btn.compound_start') : ui('pharmacy.btn.start');
        }

        if (global.UIText && typeof global.UIText.applyDom === 'function') {
            try { global.UIText.applyDom(modal); } catch (eApply) { /* ignore */ }
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
        if (r === 'insufficient_stamina') return 'pharmacy.try.fail.insufficient_stamina';
        if (r === 'inventory_full') return 'pharmacy.try.fail.inventory_full';
        if (r === 'consume_inputs_failed') return 'pharmacy.try.fail.consume_failed';
        if (r === 'bad_args') return 'pharmacy.try.fail.bad_args';
        if (r === 'craft_in_progress') return 'pharmacy.try.fail.craft_in_progress';
        if (r === 'pharmacy_station_repair_locked') return 'pharmacy.try.fail.repair_locked';
        if (r === 'injection_locked') return 'item.use.cannot';
        if (r === 'solvent_required') return 'pharmacy.compound.fail.solvent_required';
        if (r === 'too_many_solvent') return 'pharmacy.compound.fail.too_many_solvent';
        if (r === 'over_capacity') return 'pharmacy.compound.fail.over_capacity';
        if (r === 'not_compound_component') return 'pharmacy.compound.fail.not_component';
        if (r === 'compounding_unavailable') return 'pharmacy.compound.fail.unavailable';
        if (r === 'no_components') return 'pharmacy.compound.fail.no_components';
        if (r === 'compound_failed') return 'pharmacy.compound.fail.failed';
        if (r === 'incompatible_compound') return 'pharmacy.compound.fail.failed';
        return 'pharmacy.try.fail.unknown';
    }

    function openPharmacyStationPanel() {
        if (isPreCreationGameplayRestricted()) {
            showIntroBlockedMsg();
            return;
        }
        if (guardPlayerComaBlocked()) return;
        if (pharmacyStationPanelOpen) return;
        if (!StationContext.isOnPharmacyStationTile()) {
            showMsg(ui('pharmacy.station.not_on_tile'), 'info');
            return;
        }
        if (StationContext.isPharmacyUiBlockedByRepair()) {
            showMsg(ui('pharmacy.station.locked_until_repaired'), 'info');
            return;
        }
        if (global.Survival && typeof global.Survival.advanceTick === 'function') global.Survival.advanceTick();
        pharmacyStationPanelOpen = true;
        equipmentOpen = false;
        var modal = document.getElementById('modal-pharmacy-station');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        renderPharmacyStationPanel();
        renderScene();
    }

    function closePharmacyStationPanel() {
        if (!pharmacyStationPanelOpen) return;
        if (global.Survival && typeof global.Survival.advanceTick === 'function') global.Survival.advanceTick();
        pharmacyStationPanelOpen = false;
        var modal = document.getElementById('modal-pharmacy-station');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        renderScene();
    }

    function refreshIfOpen() {
        if (pharmacyStationPanelOpen) renderPharmacyStationPanel();
    }

    function isOpen() {
        return pharmacyStationPanelOpen;
    }

    function initPanel() {
        if (!staminaUnsubscribe && global.SceneHud && global.SceneHud.subscribe) {
            staminaUnsubscribe = global.SceneHud.subscribe('status', function () {
                if (pharmacyStationPanelOpen) renderPharmacyStamina();
            });
        }
        var equipmentToggle = document.getElementById('pharmacy-equipment-toggle');
        if (equipmentToggle) equipmentToggle.addEventListener('click', function () {
            if (!pharmacyStationPanelOpen || pharmacyStationUiState.compound_mode) return;
            equipmentOpen = !equipmentOpen;
            renderPharmacyStationPanel();
        });
        var abPharmacy = !window.SvelteInteractions && document.getElementById('action-bar-pharmacy');
        if (abPharmacy) {
            abPharmacy.addEventListener('click', function () {
                if (pharmacyStationPanelOpen) closePharmacyStationPanel(); else openPharmacyStationPanel();
            });
        }
        var bubPharmacy = !window.SvelteInteractions && document.getElementById('player-action-pharmacy');
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
        var startBtn = document.getElementById('pharmacy-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', function () {
                if (!pharmacyStationPanelOpen) return;
                if (enhancementMode) { renderPharmacyStationPanel(); return; }
                // A flag change must not turn a queued injection click into ordinary crafting.
                if (resetLockedCompoundMode()) { renderPharmacyStationPanel(); return; }
                var mid = pharmacyStationUiState.method_id ? String(pharmacyStationUiState.method_id) : '';
                var inputs = StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
                var res = pharmacyStationUiState.compound_mode ? tryCompoundAtStation(inputs) : tryPharmacyAtStation(mid, inputs);
                if (res && res.consumed === true) setPharmacyInputs([]);
                if (!res || res.ok !== true) {
                    var key = pharmacyStartReasonToMsgKey(res ? res.reason : 'unknown');
                    var vars = {};
                    if (res && res.item_id) vars.item = StationCraftCore.getItemDisplayNameSafe(res.item_id);
                    if (res && res.method_id) vars.method = String(res.method_id);
                    if (res && res.required_accessory_item_id) vars.accessory = StationCraftCore.getItemDisplayNameSafe(res.required_accessory_item_id);
                    if (res && res.need != null && res.current != null) { vars.need = res.need; vars.cur = res.current; }
                    showMsg(ui(key, vars), 'warn');
                    renderPharmacyStationPanel();
                    return;
                }
                setPharmacyInputs([]);
                renderPharmacyStationPanel();
            });
        }
    }

    global.PharmacyStationPanel = {
        setUiDeps: setUiDeps,
        init: initPanel,
        open: openPharmacyStationPanel,
        close: closePharmacyStationPanel,
        render: renderPharmacyStationPanel,
        refreshIfOpen: refreshIfOpen,
        isOpen: isOpen,
        setEnhancementView: setEnhancementView,
        selectMode: selectMode,
        getMode: getMode,
        getUpgradeProject: getUpgradeProject,
        isItemAllowedPharmacyIngredient: function (id) { return StationCraftCore.isItemAllowedPharmacyIngredient(id); }
    };
})(typeof window !== 'undefined' ? window : globalThis);
