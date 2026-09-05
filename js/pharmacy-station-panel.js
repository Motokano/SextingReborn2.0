/**
 * PharmacyStationPanel — 制药站面板 DOM（scene-app 组合根化拆解 ②）
 *
 * 来源：自 js/scene-app.js 迁出（pharmacy 面板族：渲染/开合/事件绑定 + UI 态变量）。
 * 语义零变；补全两处 latent 死引用（pharmacyResourceSlotKey/parsePharmacyResourceSlotKey
 * 原为 0 定义的缺失孪生，镜像 cooking 版）。
 *
 * 依赖注入 setUiDeps({ ui, showMsg, render, tryPharmacyAtStation, canAddFuelAtCurrentTile,
 *   onAddFuelClick, isPreCreationGameplayRestricted, showIntroBlockedMsg, guardPlayerComaBlocked })。
 * 状态/规则在 PharmacyStation/StationCraftCore/InventoryHelpers/StationContext；本模块只管 DOM。
 */
(function (global) {
    'use strict';

    var IE = global.InventoryEquipment;

    var pharmacyStationPanelOpen = false;
    var pharmacyStationUiState = {
        method_id: '',
        inputs: [],
        /** 制药台模态：燃料来源格子 */
        selected_fuel_slot_key: ''
    };
    var PHARMACY_FUEL_MAX_POINTS = 100;

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
    function canAddFuelAtCurrentTile() {
        return (typeof uiDeps.canAddFuelAtCurrentTile === 'function') ? !!uiDeps.canAddFuelAtCurrentTile() : false;
    }
    function onAddFuelClick(opts) {
        if (typeof uiDeps.onAddFuelClick === 'function') uiDeps.onAddFuelClick(opts);
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
    /** 补全原缺失孪生：容器格键（镜像 cookingResourceSlotKey）。 */
    function pharmacyResourceSlotKey(containerType, index) {
        return String(containerType || '') + '|' + String(Math.floor(Number(index)));
    }
    /** 补全原缺失孪生：容器格键解析（镜像 parseCookingResourceSlotKey）。 */
    function parsePharmacyResourceSlotKey(key) {
        if (key == null || typeof key !== 'string') return null;
        var p = key.indexOf('|');
        if (p <= 0) return null;
        var ct = key.slice(0, p);
        var idx = parseInt(key.slice(p + 1), 10);
        if (!isFinite(idx) || idx < 0) return null;
        return { containerType: ct, index: idx };
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
        var fuelSlots = global.InventoryHelpers.findAllContainerSlotsByPredicate(function (cell) {
            return StationCraftCore.getItemFuelPoints(cell.item_id) > 0;
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
                    var disp = StationCraftCore.getItemDisplayNameSafe(iid);
                    var cnt = (sl.item.count != null && parseInt(sl.item.count, 10) > 0) ? parseInt(sl.item.count, 10) : 1;
                    var gain = StationCraftCore.getItemFuelPoints(iid);
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
                    sLine.textContent = ui('pharmacy.station_resource.available_fmt', { n: cnt });
                    countsEl.appendChild(gLine);
                    countsEl.appendChild(sLine);
                    row.appendChild(left);
                    row.appendChild(countsEl);
                    row.onclick = function () {
                        pharmacyStationUiState.selected_fuel_slot_key = rowKey;
                        renderPharmacyStationPanel();
                    };
                    wrap.appendChild(row);
                })(slots[ri]);
            }
        }
        appendResourceRows(fuelWrap, fuelSlots, 'fuel', pharmacyStationUiState.selected_fuel_slot_key);
    }

    function renderPharmacyStationPanel() {
        var modal = document.getElementById('modal-pharmacy-station');
        if (!modal) return;
        var methodWrap = document.getElementById('pharmacy-method-list');
        var listEl = document.getElementById('pharmacy-input-list');
        var accessoryList = document.getElementById('pharmacy-accessory-list');
        var accessorySel = document.getElementById('pharmacy-add-accessory');
        var knownWrap = document.getElementById('pharmacy-known-list');
        var kvWrap = document.getElementById('pharmacy-kv');
        var helpEl = document.getElementById('pharmacy-help');
        var startBtn = document.getElementById('pharmacy-start-btn');
        var mid = pharmacyStationUiState.method_id ? String(pharmacyStationUiState.method_id) : '';

        if (methodWrap) {
            methodWrap.innerHTML = '';
            var ids = Object.keys(PharmacyStation.getMethods());
            ids.sort();
            var mi;
            for (mi = 0; mi < ids.length; mi++) {
                var idm = ids[mi];
                var mObj = PharmacyStation.getMethods()[idm];
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-method' + (String(idm) === String(mid) ? ' active' : '');
                btn.textContent = PharmacyStation.getPharmacyMethodDisplayName(idm, mObj);
                btn.setAttribute('data-method-id', idm);
                btn.onclick = (function (xid) { return function () { setPharmacyMethodId(xid); renderPharmacyStationPanel(); }; })(idm);
                methodWrap.appendChild(btn);
            }
        }

        // 投料列表
        if (listEl) {
            listEl.innerHTML = '';
            var selected = StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
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
                    nameEl.textContent = StationCraftCore.getItemDisplayNameSafe(id0) + ' (' + String(id0) + ')';
                    var cntEl = document.createElement('div');
                    cntEl.className = 'icnt';
                    cntEl.textContent = 'x' + c0;
                    var btnDel = document.createElement('button');
                    btnDel.type = 'button';
                    btnDel.className = 'btn-mini';
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
                    row.appendChild(nameEl);
                    row.appendChild(cntEl);
                    row.appendChild(btnDel);
                    listEl.appendChild(row);
                }
            }
        }

        renderPharmacyIngredientPickerList();

        // 配件安装/卸下
        var csAcc = PharmacyStation.getState();
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
                    aname.textContent = StationCraftCore.getItemDisplayNameSafe(aid) + ' (' + aid + ')';
                    var abtn = document.createElement('button');
                    abtn.type = 'button';
                    abtn.className = 'btn-mini';
                    abtn.textContent = ui('pharmacy.btn.remove');
                    abtn.onclick = (function (rid) {
                        return function () {
                            var ret = PharmacyStation.uninstallPharmacyAccessoryToInventory(rid);
                            if (!ret || !ret.ok) {
                                showMsg(ui('pharmacy.accessory.uninstall_fail', { item: StationCraftCore.getItemDisplayNameSafe(rid) }), 'warn');
                            } else {
                                showMsg(ui('pharmacy.accessory.uninstall_ok', { item: StationCraftCore.getItemDisplayNameSafe(rid) }), 'success');
                            }
                            renderPharmacyStationPanel();
                            SceneHud.refresh('backpack');
                            SceneHud.refresh('status');
                            if (global.SceneRenderer) global.SceneRenderer.render();
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
            var accOpts = PharmacyStation.getPharmacyAccessoryOptionsFromInventory(installed);
            accessorySel.innerHTML = '';
            for (var ax = 0; ax < accOpts.length; ax++) {
                var ao = accOpts[ax];
                var o = document.createElement('option');
                o.value = ao.item_id;
                o.textContent = StationCraftCore.getItemDisplayNameSafe(ao.item_id) + ' (' + ao.item_id + ') · ' + ui('pharmacy.inputs.available_fmt', { n: ao.count });
                accessorySel.appendChild(o);
            }
            if (prevAcc && accOpts.some(function (z) { return String(z.item_id) === prevAcc; })) accessorySel.value = prevAcc;
        }

        // 已知配方快捷填材（可选）
        if (knownWrap) {
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
                    var rName = rid;
                    try {
                        if (global.UIText && typeof global.UIText.t === 'function') {
                            rName = global.UIText.t('pharmacy.recipe.' + legacyRecipeKey);
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
        var mSel = (PharmacyStation.getMethods() && mid && PharmacyStation.getMethods()[String(mid)]) ? PharmacyStation.getMethods()[String(mid)] : null;
        var cs = PharmacyStation.getState();
        var curFuel = parseInt(cs.fuel_points, 10) || 0;
        var needFuel = mSel ? StationCraftCore.readMethodCostValue(mSel, 'fuel', 'fuel_cost') : 0;
        var needTicks = mSel ? StationCraftCore.readMethodCostValue(mSel, 'ticks', 'craft_ticks') : 0;
        var needStamina = mSel ? StationCraftCore.readMethodCostValue(mSel, 'stamina', 'stamina_cost') : 0;
        var survState = global.Survival && typeof global.Survival.getState === 'function' ? global.Survival.getState() : null;
        var curStamina = survState ? Number(survState.stamina || 0) : 0;
        var activeCraft = PharmacyStation.getActiveCraft();

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

        var okStart = !!(mid && StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []).length) && !activeCraft;
        if (startBtn) {
            startBtn.disabled = !okStart;
        }

        var fuelModalBtn = document.getElementById('pharmacy-modal-add-fuel-btn');
        var fuelModalOk = canAddFuelAtCurrentTile() && !!pharmacyStationUiState.selected_fuel_slot_key;
        if (fuelModalBtn) fuelModalBtn.disabled = !fuelModalOk;

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
        pharmacyStationUiState.selected_fuel_slot_key = '';
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
                SceneHud.refresh('backpack');
                SceneHud.refresh('status');
                if (global.SceneRenderer) global.SceneRenderer.render();
            });
        }
        var addAccessoryBtn = document.getElementById('pharmacy-add-accessory-btn');
        if (addAccessoryBtn) {
            addAccessoryBtn.addEventListener('click', function () {
                if (!pharmacyStationPanelOpen) return;
                var sel = document.getElementById('pharmacy-add-accessory');
                var aid = sel && sel.value ? String(sel.value) : '';
                if (!aid) return;
                var ret = PharmacyStation.installPharmacyAccessoryFromInventory(aid);
                if (!ret || !ret.ok) {
                    showMsg(ui('pharmacy.accessory.install_fail', { item: StationCraftCore.getItemDisplayNameSafe(aid) }), 'warn');
                    renderPharmacyStationPanel();
                    return;
                }
                showMsg(ui('pharmacy.accessory.install_ok', { item: StationCraftCore.getItemDisplayNameSafe(aid) }), 'success');
                renderPharmacyStationPanel();
                SceneHud.refresh('backpack');
                SceneHud.refresh('status');
                if (global.SceneRenderer) global.SceneRenderer.render();
            });
        }
        var startBtn = document.getElementById('pharmacy-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', function () {
                if (!pharmacyStationPanelOpen) return;
                var mid = pharmacyStationUiState.method_id ? String(pharmacyStationUiState.method_id) : '';
                var inputs = StationCraftCore.normalizePharmacyInputs(pharmacyStationUiState.inputs || []);
                var res = tryPharmacyAtStation(mid, inputs);
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
        isItemAllowedPharmacyIngredient: function (id) { return StationCraftCore.isItemAllowedPharmacyIngredient(id); }
    };
})(typeof window !== 'undefined' ? window : globalThis);
