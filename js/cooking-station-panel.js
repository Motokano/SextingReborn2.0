/**
 * CookingStationPanel — 烹饪站面板 DOM（scene-app 组合根化拆解 ②）
 *
 * 来源：自 js/scene-app.js 迁出（烹饪面板族：渲染/开合/事件绑定 + UI 态变量）。
 * 语义零变。状态/规则在 CookingStation/StationCraftCore/InventoryHelpers/StationContext；本模块只管 DOM。
 *
 * 依赖注入 setUiDeps({ ui, showMsg, render, tryCookAtStation, canPourWaterAtCurrentTile,
 *   canAddFuelAtCurrentTile, onPourWaterClick, onAddFuelClick, isPreCreationGameplayRestricted,
 *   showIntroBlockedMsg, guardPlayerComaBlocked })。
 */
(function (global) {
    'use strict';

    var IE = global.InventoryEquipment;

    var cookingStationPanelOpen = false;
    var cookingStationUiState = {
        method_id: '',
        inputs: [],
        /** 烹饪台模态：注水来源格子 `containerType|index` */
        selected_water_slot_key: '',
        /** 烹饪台模态：燃料来源格子 */
        selected_fuel_slot_key: ''
    };
    var COOKING_FUEL_MAX_POINTS = 1000;
    var COOKING_WATER_MAX_POINTS = 1000;

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
    function tryCookAtStation(mid, inputs) {
        return (typeof uiDeps.tryCookAtStation === 'function') ? uiDeps.tryCookAtStation(mid, inputs) : { ok: false, reason: 'missing_di' };
    }
    function canPourWaterAtCurrentTile() {
        return (typeof uiDeps.canPourWaterAtCurrentTile === 'function') ? !!uiDeps.canPourWaterAtCurrentTile() : false;
    }
    function canAddFuelAtCurrentTile() {
        return (typeof uiDeps.canAddFuelAtCurrentTile === 'function') ? !!uiDeps.canAddFuelAtCurrentTile() : false;
    }
    function onPourWaterClick(opts) {
        if (typeof uiDeps.onPourWaterClick === 'function') uiDeps.onPourWaterClick(opts);
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
                if (!StationCraftCore.isItemAllowedCookingIngredient(id)) continue;
                if (global.InventoryHelpers.getInventoryCountByItemId(id) <= 0) continue;
                seen[id] = true;
                out.push(id);
            }
        }
        out.sort();
        return out;
    }

    function setCookingMethodId(mid) {
        cookingStationUiState.method_id = (mid != null) ? String(mid) : '';
    }

    function setCookingInputs(list) {
        cookingStationUiState.inputs = StationCraftCore.normalizeCookingInputs(list || []);
    }

    function getStagedCookingCountForItem(itemId) {
        var arr = StationCraftCore.normalizeCookingInputs(cookingStationUiState.inputs || []);
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
        if (!StationCraftCore.isItemAllowedCookingIngredient(iid)) {
            showMsg(ui('cooking.try.fail.not_ingredient', { item: iid }), 'info');
            return;
        }
        var have = global.InventoryHelpers.getInventoryCountByItemId(iid);
        var staged = getStagedCookingCountForItem(iid);
        if (have <= 0 || staged >= have) {
            showMsg(ui('cooking.try.fail.missing_inputs', { item: StationCraftCore.getItemDisplayNameSafe(iid) }), 'info');
            return;
        }
        var arr = StationCraftCore.normalizeCookingInputs(cookingStationUiState.inputs || []);
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
            var disp = StationCraftCore.getItemDisplayNameSafe(iid);
            if (f && String(iid).toLowerCase().indexOf(f) < 0 && String(disp).toLowerCase().indexOf(f) < 0) continue;
            nShown++;
            var have = global.InventoryHelpers.getInventoryCountByItemId(iid);
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
                        var tipHtml = SceneUi.buildItemTooltipHtmlForTemplate(iid, tpl, null, char0);
                        row.addEventListener('mouseenter', function (h, elRef) { return function () { SceneUi.showItemTooltip(h, elRef); }; }(tipHtml, row));
                        row.addEventListener('mouseleave', SceneUi.hideItemTooltip);
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
            if (StationCraftCore.cookingResourceSlotKey(slots[si].containerType, slots[si].index) === key) return true;
        }
        return false;
    }

    function renderCookingWaterFuelPickLists() {
        var waterWrap = document.getElementById('cooking-water-source-list');
        var fuelWrap = document.getElementById('cooking-fuel-source-list');
        if (!waterWrap || !fuelWrap) return;
        var char0 = IE && IE.getCharacterForDisplay ? IE.getCharacterForDisplay() : null;
        var waterSlots = global.InventoryHelpers.findAllContainerSlotsByPredicate(function (cell) {
            return StationCraftCore.getItemWaterPoints(cell.item_id) > 0;
        });
        var fuelSlots = global.InventoryHelpers.findAllContainerSlotsByPredicate(function (cell) {
            return StationCraftCore.getItemFuelPoints(cell.item_id) > 0;
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
                    var disp = StationCraftCore.getItemDisplayNameSafe(iid);
                    var cnt = (sl.item.count != null && parseInt(sl.item.count, 10) > 0) ? parseInt(sl.item.count, 10) : 1;
                    var gain = kind === 'water' ? StationCraftCore.getItemWaterPoints(iid) : StationCraftCore.getItemFuelPoints(iid);
                    var gainTxt = kind === 'water'
                        ? ui('cooking.station_resource.water_gain_fmt', { n: gain })
                        : ui('cooking.station_resource.fuel_gain_fmt', { n: gain });
                    var rowKey = StationCraftCore.cookingResourceSlotKey(sl.containerType, sl.index);
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
                                var tipHtml = SceneUi.buildItemTooltipHtmlForTemplate(iid, tpl, null, char0);
                                row.addEventListener('mouseenter', function (h, elRef) { return function () { SceneUi.showItemTooltip(h, elRef); }; }(tipHtml, row));
                                row.addEventListener('mouseleave', SceneUi.hideItemTooltip);
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
            var ids = CookingStation.getMethods() ? Object.keys(CookingStation.getMethods()) : [];
            for (var mi = 0; mi < ids.length; mi++) {
                if (CookingStation.isCookingMethodUnlockedAtStation(ids[mi])) { mid = ids[mi]; break; }
            }
            if (mid) setCookingMethodId(mid);
        }

        // 工艺按钮（仅显示已解锁）
        if (methodWrap) {
            methodWrap.innerHTML = '';
            var mids = CookingStation.getMethods() ? Object.keys(CookingStation.getMethods()) : [];
            mids.sort(function (a, b) {
                var na = (CookingStation.getMethods()[a] && CookingStation.getMethods()[a].name) ? String(CookingStation.getMethods()[a].name) : a;
                var nb = (CookingStation.getMethods()[b] && CookingStation.getMethods()[b].name) ? String(CookingStation.getMethods()[b].name) : b;
                return na.localeCompare(nb, 'zh-Hans-CN');
            });
            for (var mx = 0; mx < mids.length; mx++) {
                var idm = mids[mx];
                if (!CookingStation.isCookingMethodUnlockedAtStation(idm)) continue;
                var mObj = CookingStation.getMethods()[idm] || {};
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
            var selected = StationCraftCore.normalizeCookingInputs(cookingStationUiState.inputs || []);
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
                    nameEl.textContent = StationCraftCore.getItemDisplayNameSafe(id0) + ' (' + String(id0) + ')';
                    var cntEl = document.createElement('div');
                    cntEl.className = 'icnt';
                    cntEl.textContent = 'x' + c0;
                    var btnDel = document.createElement('button');
                    btnDel.type = 'button';
                    btnDel.className = 'btn-mini';
                    btnDel.textContent = ui('cooking.btn.remove');
                    btnDel.onclick = (function (rid) {
                        return function () {
                            var arr = StationCraftCore.normalizeCookingInputs(cookingStationUiState.inputs || []);
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
        var csAcc = CookingStation.getState();
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
                    aname.textContent = StationCraftCore.getItemDisplayNameSafe(aid) + ' (' + aid + ')';
                    var abtn = document.createElement('button');
                    abtn.type = 'button';
                    abtn.className = 'btn-mini';
                    abtn.textContent = ui('cooking.btn.remove');
                    abtn.onclick = (function (rid) {
                        return function () {
                            var ret = CookingStation.uninstallCookingAccessoryToInventory(rid);
                            if (!ret || !ret.ok) {
                                showMsg(ui('cooking.accessory.uninstall_fail', { item: StationCraftCore.getItemDisplayNameSafe(rid) }), 'warn');
                            } else {
                                showMsg(ui('cooking.accessory.uninstall_ok', { item: StationCraftCore.getItemDisplayNameSafe(rid) }), 'success');
                            }
                            renderCookingStationPanel();
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
            var accOpts = CookingStation.getCookingAccessoryOptionsFromInventory(installed);
            accessorySel.innerHTML = '';
            for (var ax = 0; ax < accOpts.length; ax++) {
                var ao = accOpts[ax];
                var o = document.createElement('option');
                o.value = ao.item_id;
                o.textContent = StationCraftCore.getItemDisplayNameSafe(ao.item_id) + ' (' + ao.item_id + ') · ' + ui('cooking.inputs.available_fmt', { n: ao.count });
                accessorySel.appendChild(o);
            }
            if (prevAcc && accOpts.some(function (z) { return String(z.item_id) === prevAcc; })) accessorySel.value = prevAcc;
        }

        // 已知配方快捷填材（可选）
        if (knownWrap) {
            knownWrap.innerHTML = '';
            var knownIds = (global.SceneApp && typeof global.SceneApp.getKnownCookingRecipeIds === 'function') ? global.SceneApp.getKnownCookingRecipeIds() : [];
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
                    for (rr = 0; rr < CookingStation.getRecipes().length; rr++) {
                        if (String(CookingStation.getRecipes()[rr].recipe_id) === legacyRecipeKey) { rec = CookingStation.getRecipes()[rr]; break; }
                    }
                    if (!rec) {
                        for (rr = 0; rr < CookingStation.getRecipes().length; rr++) {
                            if (String(CookingStation.getRecipes()[rr].recipe_id) === String(rid)) { rec = CookingStation.getRecipes()[rr]; break; }
                        }
                    }
                    if (!rec) continue;
                    var btnK = document.createElement('button');
                    btnK.type = 'button';
                    btnK.className = 'btn-known';
                    var rName = rid;
                    try {
                        if (global.UIText && typeof global.UIText.t === 'function') {
                            rName = global.UIText.t('cooking.recipe.' + legacyRecipeKey);
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
        var mSel = (CookingStation.getMethods() && mid && CookingStation.getMethods()[String(mid)]) ? CookingStation.getMethods()[String(mid)] : null;
        var cs = CookingStation.getState();
        var curFuel = parseInt(cs.fuel_points, 10) || 0;
        var curWater = parseInt(cs.water_points, 10) || 0;
        var needFuel = mSel ? Math.max(0, parseInt(mSel.fuel_cost, 10) || 0) : 0;
        var needWater = mSel ? Math.max(0, parseInt(mSel.water_cost, 10) || 0) : 0;
        var needTicks = mSel ? Math.max(0, parseInt(mSel.craft_ticks, 10) || 0) : 0;
        var needStamina = mSel ? Math.max(0, parseInt(mSel.stamina_cost, 10) || 0) : 0;
        var survState = global.Survival && typeof global.Survival.getState === 'function' ? global.Survival.getState() : null;
        var curStamina = survState ? Number(survState.stamina || 0) : 0;
        var activeCraft = CookingStation.getActiveCraft();

        if (kvWrap) {
            kvWrap.innerHTML = '';
            function addKv(text, bad) {
                var d = document.createElement('div');
                d.className = 'kv' + (bad ? ' bad' : '');
                d.textContent = text;
                kvWrap.appendChild(d);
            }
            addKv(ui('cooking.kv.fuel', { cur: curFuel, max: COOKING_FUEL_MAX_POINTS, need: needFuel }), curFuel < needFuel);
            var panelCtx = StationContext.getCurrentCookingStationContext();
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

        var okStart = !!(mid && StationCraftCore.normalizeCookingInputs(cookingStationUiState.inputs || []).length) && !activeCraft;
        if (startBtn) {
            startBtn.disabled = !okStart;
        }

        var pourModalBtn = document.getElementById('cooking-modal-pour-btn');
        var fuelModalBtn = document.getElementById('cooking-modal-add-fuel-btn');
        var pourModalOk = canPourWaterAtCurrentTile() && !!cookingStationUiState.selected_water_slot_key;
        var fuelModalOk = canAddFuelAtCurrentTile() && !!cookingStationUiState.selected_fuel_slot_key;
        if (pourModalBtn) pourModalBtn.disabled = !pourModalOk;
        if (fuelModalBtn) fuelModalBtn.disabled = !fuelModalOk;

        if (global.UIText && typeof global.UIText.applyDom === 'function') {
            try { global.UIText.applyDom(modal); } catch (eApply) { /* ignore */ }
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
        if (!StationContext.isOnCookingStationTile()) {
            showMsg(ui('cooking.station.not_on_tile'), 'info');
            return;
        }
        if (StationContext.isCookingUiBlockedByRepair()) {
            showMsg(ui('cooking.station.locked_until_repaired'), 'info');
            return;
        }
        if (global.Survival && typeof global.Survival.advanceTick === 'function') global.Survival.advanceTick();
        cookingStationPanelOpen = true;
        cookingStationUiState.selected_water_slot_key = '';
        cookingStationUiState.selected_fuel_slot_key = '';
        var modal = document.getElementById('modal-cooking-station');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        renderCookingStationPanel();
        renderScene();
    }

    function closeCookingStationPanel() {
        if (!cookingStationPanelOpen) return;
        if (global.Survival && typeof global.Survival.advanceTick === 'function') global.Survival.advanceTick();
        cookingStationPanelOpen = false;
        var modal = document.getElementById('modal-cooking-station');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        renderScene();
    }

    function refreshIfOpen() {
        if (cookingStationPanelOpen) renderCookingStationPanel();
    }

    function isOpen() {
        return cookingStationPanelOpen;
    }

    function initPanel() {
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
                var pw = StationCraftCore.parseCookingResourceSlotKey(wk);
                if (!pw) {
                    showMsg(ui('cooking.pour_water.pick_first'), 'info');
                    return;
                }
                onPourWaterClick({ containerType: pw.containerType, index: pw.index });
                renderCookingStationPanel();
                SceneHud.refresh('backpack');
                SceneHud.refresh('status');
                if (global.SceneRenderer) global.SceneRenderer.render();
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
                var pf = StationCraftCore.parseCookingResourceSlotKey(fk);
                if (!pf) {
                    showMsg(ui('cooking.add_fuel.pick_first'), 'info');
                    return;
                }
                onAddFuelClick({ containerType: pf.containerType, index: pf.index });
                renderCookingStationPanel();
                SceneHud.refresh('backpack');
                SceneHud.refresh('status');
                if (global.SceneRenderer) global.SceneRenderer.render();
            });
        }
        var addAccessoryBtn = document.getElementById('cooking-add-accessory-btn');
        if (addAccessoryBtn) {
            addAccessoryBtn.addEventListener('click', function () {
                if (!cookingStationPanelOpen) return;
                var sel = document.getElementById('cooking-add-accessory');
                var aid = sel && sel.value ? String(sel.value) : '';
                if (!aid) return;
                var ret = CookingStation.installCookingAccessoryFromInventory(aid);
                if (!ret || !ret.ok) {
                    showMsg(ui('cooking.accessory.install_fail', { item: StationCraftCore.getItemDisplayNameSafe(aid) }), 'warn');
                    renderCookingStationPanel();
                    return;
                }
                showMsg(ui('cooking.accessory.install_ok', { item: StationCraftCore.getItemDisplayNameSafe(aid) }), 'success');
                renderCookingStationPanel();
                SceneHud.refresh('backpack');
                SceneHud.refresh('status');
                if (global.SceneRenderer) global.SceneRenderer.render();
            });
        }
        var startBtn = document.getElementById('cooking-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', function () {
                if (!cookingStationPanelOpen) return;
                var mid = cookingStationUiState.method_id ? String(cookingStationUiState.method_id) : '';
                var inputs = StationCraftCore.normalizeCookingInputs(cookingStationUiState.inputs || []);
                var res = tryCookAtStation(mid, inputs);
                if (!res || res.ok !== true) {
                    var key = cookingStartReasonToMsgKey(res ? res.reason : 'unknown');
                    var vars = {};
                    if (res && res.item_id) vars.item = StationCraftCore.getItemDisplayNameSafe(res.item_id);
                    if (res && res.method_id) vars.method = String(res.method_id);
                    if (res && res.required_accessory_item_id) vars.accessory = StationCraftCore.getItemDisplayNameSafe(res.required_accessory_item_id);
                    if (res && res.need != null && res.current != null) { vars.need = res.need; vars.cur = res.current; }
                    showMsg(ui(key, vars), 'warn');
                    renderCookingStationPanel();
                    return;
                }
                setCookingInputs([]);
                renderCookingStationPanel();
            });
        }
    }

    global.CookingStationPanel = {
        setUiDeps: setUiDeps,
        init: initPanel,
        open: openCookingStationPanel,
        close: closeCookingStationPanel,
        render: renderCookingStationPanel,
        refreshIfOpen: refreshIfOpen,
        isOpen: isOpen
    };
})(typeof window !== 'undefined' ? window : globalThis);
