/**
 * InventoryPanel — 原生背包/装备面板与显示会话.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;
    var IE = window.InventoryEquipment;
    var EQUIP_SLOT_LABELS, EQUIP_SLOT_GROUPS, backpackPanelOpen, backpackUIState;

    function updateBackpackPanel() {
        if (window.SveltePanels) { window.SveltePanels.refresh('backpack'); return; }
        var panelHeading = document.querySelector('#modal-backpack .bp-title');
        if (panelHeading) { var panelTitleKey=window.BackpackPanel && window.BackpackPanel.isEquipment()?'btn.equipment.title':'btn.backpack.title';panelHeading.setAttribute('data-ui',panelTitleKey);panelHeading.textContent=window.SceneFeedback.ui(panelTitleKey); }
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
            if (containerType === 'pocket') return window.SceneFeedback.ui('inv.pocket');
            if (containerType === 'vest') return window.SceneFeedback.ui('inv.vest');
            if (containerType === 'backpack') return window.SceneFeedback.ui('inv.backpack');
            if (containerType === 'vehicle') return window.SceneFeedback.ui('inv.vehicle');
            if (containerType === 'ground') return window.SceneFeedback.ui('inv.ground');
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
            } else if (containerType === 'groundBag') {
                var context = window.BackpackPanel.groundContext();
                var packed = context ? window.InventoryTransfer.read(context).items : [];
                packed.forEach(function (item, index) { if (item) rows.push({source:'groundBag',index:index,item:item}); });
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
            var name = tpl ? IE.getDisplayName(tpl, tier, char) : (it ? it.item_id : window.SceneFeedback.ui('common.dash'));
            if (it && (it.sewing || it.sewing_parts) && window.SewingSystem) name = window.SewingSystem.itemName(it);
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

        function doEquipFromContainer(containerType, idx, tpl, preferredSlot) {
            if (!tpl || !tpl.equip_slot || !IE || typeof IE.takeItemFromContainer !== 'function') return;
            var posNow = E.getState ? E.getState() : groundPos;
            var slotId = preferredSlot || tpl.equip_slot;
            var row = getContainerRows(containerType).find(function (r) { return r.index === idx; });
            if (slotId === 'backpack' && window.BackpackSystem) {
                var moved = window.BackpackSystem.transfer({action:'equip',source:containerType,index:idx,id:row && row.item.instance_id});
                window.SceneFeedback.showMsg(moved.message, moved.ok ? 'success' : 'warn');updateBackpackPanel();window.SceneMapView.render();return;
            }
            if (window.ModularWeaponCombat && window.ModularWeaponCombat.isWeapon(row && row.item)) {
                var check = window.ModularWeaponCombat.validateEquip(row.item, slotId);
                if (!check.success) { window.SceneFeedback.showMsg(check.message, 'warn'); return; }
            }
            var taken = IE.takeItemFromContainer(containerType, idx);
            if (!taken.success || !taken.item) return;
            var itemToEquip = taken.item;
            if (itemToEquip && itemToEquip.count != null) itemToEquip.count = 1;
            var stNow = IE.getState ? IE.getState() : {};
            var currentEq = (stNow && stNow.equipment) ? stNow.equipment[slotId] : null;
            if (currentEq) {
                var unequipped = IE.unequip(slotId, posNow);
                if (unequipped) {
                    var placedOld = IE.putItemIntoDefaultContainer(unequipped);
                    if (!placedOld || !placedOld.placed) IE.addItemToGround(posNow.mapId, posNow.x, posNow.y, unequipped);
                }
            }
            var res = IE.equip(slotId, itemToEquip);
            if (!res || !res.success) {
                var placedNew = IE.putItemIntoDefaultContainer(itemToEquip);
                if (!placedNew || !placedNew.placed) IE.addItemToGround(posNow.mapId, posNow.x, posNow.y, itemToEquip);
                window.SceneFeedback.showMsg((res && res.message) ? res.message : window.SceneFeedback.ui('inv.equip'), 'warn');
            } else {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.success.equipped'), 'success');
            }
            window.SceneMapView.markCellDirty(posNow.mapId, posNow.x, posNow.y);
            updateBackpackPanel();
            window.SceneMapView.render();
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
                listEl.innerHTML = '<div class="bp-detail-empty">' + window.SceneFeedback.ui('scene.bp.empty') + '</div>';
                return { rows: rows, picked: null };
            }
            var picked = pickRowFromState(rows);
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var disp = resolveRowDisplay(row);
                var node = document.createElement('div');
                var selected = picked && picked.index === row.index && picked.source === row.source;
                node.className = 'bp-item-row' + (selected ? ' selected' : '');
                if(row.item.dungeon_rarity)node.dataset.dungeonRarity=row.item.dungeon_rarity;
                node.innerHTML =
                    '<div class="bp-item-tier"></div>' +
                    '<div class="bp-item-main">' +
                    '<div class="bp-item-name">' + escHtml(disp.name + disp.qty) + '</div>' +
                    '<div class="bp-item-sub">' + escHtml(disp.desc || '') + '</div>' +
                    '<div class="bp-item-meta">' + escHtml(row.item.item_id || '') + '</div>' +
                    '</div>';
                var tipHtml = SceneUi.buildItemTooltipHtmlForTemplate(row.item.item_id, disp.tpl, row.item, char);
                node.addEventListener('mouseenter', function (h, el) { return function () { SceneUi.showItemTooltip(h, el); }; }(tipHtml, node));
                node.addEventListener('mouseleave', SceneUi.hideItemTooltip);
                node.onclick = (function (r) {
                    return function () {
                        backpackUIState.equipDetailSlot = null;
                        backpackUIState.selectedContainer = backpackUIState.container;
                        backpackUIState.selectedIndex = r.index;
                        updateBackpackPanel();
                    };
                })(row);
                listEl.appendChild(node);
            }
            return { rows: rows, picked: picked };
        }

        function renderDetail(listPicked) {
            var detailEl = document.getElementById('backpack-detail');
            if (!detailEl) return;
            detailEl.innerHTML = '';
            var picked = listPicked;
            // 装备栏行被点击时：详情区改显已穿装备的信息
            if (backpackUIState.equipDetailSlot != null) {
                var eqInst = ieState.equipment && ieState.equipment[backpackUIState.equipDetailSlot];
                if (eqInst && eqInst.item_id) {
                    picked = { source: 'equipment', index: backpackUIState.equipDetailSlot, item: eqInst };
                } else {
                    backpackUIState.equipDetailSlot = null;
                }
            }
            if (!picked || !picked.item || !picked.item.item_id) {
                detailEl.innerHTML = '<div class="bp-detail-empty">' + window.SceneFeedback.ui('scene.bp.no_selection') + '</div>';
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
            var attrsText = (typeof SceneUi.formatItemAttributes === 'function') ? SceneUi.formatItemAttributes(disp.tpl, picked.item) : '';
            if (attrsText) {
                var attrsDiv = document.createElement('div');
                attrsDiv.className = 'bp-detail-attrs';
                attrsDiv.textContent = attrsText;
                detailEl.appendChild(attrsDiv);
            }
            var modulesHtml = '';
            try {
                if (window.ItemInfoModules && typeof window.ItemInfoModules.renderTooltipModulesHtml === 'function') {
                    modulesHtml = window.ItemInfoModules.renderTooltipModulesHtml({
                        itemId: picked.item.item_id,
                        tpl: disp.tpl,
                        inst: picked.item,
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
            var fieldAppend = SceneUi.buildItemFieldRulesHtmlAppend(picked.item.item_id, disp.tpl, picked.item, char);
            if (fieldAppend) {
                var fieldWrap = document.createElement('div');
                fieldWrap.className = 'bp-detail-field-rules';
                fieldWrap.innerHTML = fieldAppend;
                detailEl.appendChild(fieldWrap);
            }
            try {
                if (window.ItemAssemblyDisplay && typeof window.ItemAssemblyDisplay.renderAssemblyHtml === 'function') {
                    var assemblyWrap = document.createElement('div');
                    assemblyWrap.className = 'bp-detail-assembly';
                    assemblyWrap.innerHTML = window.ItemAssemblyDisplay.renderAssemblyHtml({
                        inst: picked.item,
                        character: char,
                        interactive: picked.source !== 'ground' && picked.source !== 'groundBag',
                        showWeight: false
                    }) || '';
                    if (assemblyWrap.innerHTML) {
                        detailEl.appendChild(assemblyWrap);
                        assemblyWrap.querySelectorAll('[data-assembly-attach]').forEach(function (btn) {
                            btn.onclick = function () {
                                var slotEl = btn.closest('.item-assembly-slot');
                                var select = slotEl ? slotEl.querySelector('[data-assembly-candidate]') : null;
                                var selected = select ? String(select.value || '').split(':') : [];
                                if (selected.length !== 2 || !window.ItemAssembly) return;
                                var result = window.ItemAssembly.attachFromContainer(
                                    btn.getAttribute('data-host-instance'),
                                    btn.getAttribute('data-slot-id'),
                                    selected[0],
                                    parseInt(selected[1], 10)
                                );
                                if (result && result.ok) window.SceneFeedback.showMsg(window.SceneFeedback.ui('item.assembly.message.attached'), 'success');
                                else window.SceneFeedback.showMsg(window.ItemAssemblyDisplay.messageForReason(result && result.reason), 'warn');
                                updateBackpackPanel();
                                window.SceneMapView.render();
                            };
                        });
                        assemblyWrap.querySelectorAll('[data-assembly-detach]').forEach(function (btn) {
                            btn.onclick = function () {
                                if (!window.ItemAssembly) return;
                                var result = window.ItemAssembly.detachToInventory(
                                    btn.getAttribute('data-host-instance'),
                                    btn.getAttribute('data-slot-id')
                                );
                                if (result && result.ok) window.SceneFeedback.showMsg(window.SceneFeedback.ui('item.assembly.message.detached'), 'info');
                                else window.SceneFeedback.showMsg(window.ItemAssemblyDisplay.messageForReason(result && result.reason), 'warn');
                                updateBackpackPanel();
                                window.SceneMapView.render();
                            };
                        });
                    }
                }
            } catch (eAssembly) { /* 装配区异常不影响其他物品操作 */ }

            var actions = document.createElement('div');
            actions.className = 'bp-detail-actions';
            function addActionBtn(label, onClick) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'bp-action-btn';
                if (label === window.SceneFeedback.ui('inv.drop') || label === window.SceneFeedback.ui('inv.pickup')) btn.classList.add('bp-legacy-transfer');
                btn.textContent = label;
                btn.onclick = onClick;
                actions.appendChild(btn);
            }
            if (picked.source === 'groundBag') return;
            if (disp.tpl && disp.tpl.equip_slot === 'backpack' && window.BackpackSystem) {
                var bagAction = function (action) {
                    var moved = window.BackpackSystem.transfer({action:action,source:picked.source,index:picked.index,id:picked.item.instance_id});
                    window.SceneFeedback.showMsg(moved.message,moved.ok?'success':'warn');
                    if (moved.ok) backpackUIState.equipDetailSlot = null;
                    window.SceneMapView.markCellDirty(groundPos.mapId,groundPos.x,groundPos.y);updateBackpackPanel();window.SceneMapView.render();
                };
                if (picked.source === 'equipment') {
                    addActionBtn(window.SceneFeedback.ui('inv.unequip'),function(){bagAction('unequip');});
                    addActionBtn('整包放下',function(){bagAction('drop');});
                } else if (picked.source === 'ground') {
                    addActionBtn(window.SceneFeedback.ui('inv.pickup'),function(){bagAction('pickup');});
                    addActionBtn(window.SceneFeedback.ui('inv.equip'),function(){bagAction('equip');});
                } else {
                    addActionBtn(window.SceneFeedback.ui('inv.equip'),function(){bagAction('equip');});
                    addActionBtn(window.SceneFeedback.ui('inv.drop'),function(){bagAction('drop');});
                }
                detailEl.appendChild(actions);
                return;
            }
            if (picked.source === 'equipment') {
                if (picked.index === 'water_flask') addActionBtn(window.SceneFeedback.ui('flask.action.drink'), function () { window.ItemUseActions.tryDrinkWaterFlask(picked.item.instance_id); });
                addActionBtn(window.SceneFeedback.ui(picked.index === 'water_flask' ? 'flask.action.unequip' : 'inv.unequip'), function () {
                    var old = IE.unequip(picked.index, groundPos);
                    if (old) {
                        var placed = IE.putItemIntoDefaultContainer(old);
                        if (!placed || !placed.placed) IE.addItemToGround(groundPos.mapId, groundPos.x, groundPos.y, old);
                        window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.info.unequipped'), 'info');
                        window.SceneMapView.markCellDirty(groundPos.mapId, groundPos.x, groundPos.y);
                    }
                    backpackUIState.equipDetailSlot = null;
                    updateBackpackPanel();
                    window.SceneMapView.render();
                });
            } else if (picked.source !== 'ground') {
                if (ItemUse.itemTemplateIsConsumable(disp.tpl)) {
                    // 47 §5.2：外敷需手动选部位（七部位），其余途径直接使用。
                    var useRoute = (typeof ItemUse.getUseActionRoute === 'function') ? ItemUse.getUseActionRoute(disp.tpl) : '';
                    if (useRoute === 'topical') {
                        var partHint = document.createElement('div');
                        partHint.className = 'bp-detail-desc';
                        partHint.textContent = window.SceneFeedback.ui('item.use.pick_part');
                        actions.appendChild(partHint);
                        var partIds = (Array.isArray(ItemUse.BODY_PART_IDS) && ItemUse.BODY_PART_IDS.length) ? ItemUse.BODY_PART_IDS : window.SceneStatusPanel.BODY_PART_IDS;
                        var pi;
                        for (pi = 0; pi < partIds.length; pi++) {
                            (function (partId) {
                                addActionBtn(window.SceneFeedback.ui('item.use.topical') + ' ' + window.SceneFeedback.ui(window.SceneStatusPanel.BODY_PART_LABELS[partId] || partId), function () {
                                    window.ItemUseActions.tryUseItemFromContainer(picked.source, picked.index, { part_id: partId });
                                });
                            })(partIds[pi]);
                        }
                    } else {
                        addActionBtn(window.SceneFeedback.ui('inv.use'), function () { window.ItemUseActions.tryUseItemFromContainer(picked.source, picked.index); });
                    }
                }
                if (disp.tpl && disp.tpl.equip_slot) {
                    if (window.ModularWeaponCombat && window.ModularWeaponCombat.isWeapon(picked.item)) {
                        addActionBtn('右手持用', function () { doEquipFromContainer(picked.source, picked.index, disp.tpl, 'weapon_right'); });
                        addActionBtn('左手持用', function () { doEquipFromContainer(picked.source, picked.index, disp.tpl, 'weapon_left'); });
                    } else addActionBtn(window.SceneFeedback.ui(disp.tpl.equip_slot === 'water_flask' ? 'flask.action.equip' : 'inv.equip'), function () { doEquipFromContainer(picked.source, picked.index, disp.tpl); });
                }
                addActionBtn(window.SceneFeedback.ui('inv.drop'), function () {
                    var pos = E.getState();
                    var r = IE.dropItemToGround(picked.source, picked.index, pos.mapId, pos.x, pos.y);
                    if (r.success) window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.info.dropped'), 'info');
                    else if (r.message) window.SceneFeedback.showMsg(r.message, 'warn');
                    window.SceneMapView.markCellDirty(pos.mapId, pos.x, pos.y);
                    updateBackpackPanel();
                    window.SceneMapView.render();
                });
            } else {
                addActionBtn(window.SceneFeedback.ui('inv.pickup'), function () {
                    var r0 = IE.pickUpFromGround(st.mapId, st.x, st.y, picked.index);
                    if (r0.success) window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.success.picked'), 'success');
                    else if (r0.message) window.SceneFeedback.showMsg(r0.message, 'warn');
                    window.SceneMapView.markCellDirty(st.mapId, st.x, st.y);
                    updateBackpackPanel();
                    window.SceneMapView.render();
                });
                if (disp.tpl && disp.tpl.equip_slot) {
                    var handChoices = window.ModularWeaponCombat && window.ModularWeaponCombat.isWeapon(picked.item)
                        ? [['右手持用', 'weapon_right'], ['左手持用', 'weapon_left']] : [[window.SceneFeedback.ui(disp.tpl.equip_slot === 'water_flask' ? 'flask.action.equip' : 'inv.equip'), disp.tpl.equip_slot]];
                    handChoices.forEach(function (choice) {
                        addActionBtn(choice[0], function () {
                            var r1 = IE.equipFromGround(st.mapId, st.x, st.y, picked.index, choice[1]);
                            if (r1.success) window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.success.equipped'), 'success');
                            else if (r1.message) window.SceneFeedback.showMsg(r1.message, 'warn');
                            window.SceneMapView.markCellDirty(st.mapId, st.x, st.y);
                            updateBackpackPanel();
                            window.SceneMapView.render();
                        });
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
            for (var g = 0; g < EQUIP_SLOT_GROUPS.length; g++) {
                var group = EQUIP_SLOT_GROUPS[g];
                var gTitle = document.createElement('div');
                gTitle.className = 'equip-group-title';
                gTitle.textContent = window.SceneFeedback.ui(group.label);
                equipList.appendChild(gTitle);
                for (var s = 0; s < group.slots.length; s++) {
                    var slotId = group.slots[s];
                    if (IE.EQUIP_SLOT_IDS.indexOf(slotId) < 0) continue;
                    var row = document.createElement('div');
                    row.className = 'equip-row';
                    var labelKey = EQUIP_SLOT_LABELS[slotId] || slotId;
                    var label = (labelKey && String(labelKey).indexOf('equip.slot.') === 0) ? window.SceneFeedback.ui(labelKey) : labelKey;
                    var eq = eqState[slotId];
                    var eqTpl = (eq && eq.item_id) ? IE.getItemTemplate(eq.item_id) : null;
                    var itemName = window.SceneFeedback.ui('common.dash');
                    if (eq && eq.item_id) {
                        var eqTier = IE.getItemDisplayTier ? IE.getItemDisplayTier(eq.item_id, char) : 0;
                        itemName = eqTpl ? IE.getDisplayName(eqTpl, eqTier, char) : eq.item_id;
                    }
                    var hasItem = !!(eq && eq.item_id);
                    if (hasItem) row.className = 'equip-row has-item';
                    if (hasItem && backpackUIState.equipDetailSlot === slotId) row.className = 'equip-row has-item selected';
                    row.innerHTML = '<span class="slot-name">' + escHtml(label) + '</span><span class="item-name">' + escHtml(itemName) + '</span>';
                    if (hasItem) {
                        var tipHtml = SceneUi.buildItemTooltipHtmlForTemplate(eq.item_id, eqTpl, eq, char);
                        row.addEventListener('mouseenter', function (h, el) { return function () { SceneUi.showItemTooltip(h, el); }; }(tipHtml, row));
                        row.addEventListener('mouseleave', SceneUi.hideItemTooltip);
                        row.onclick = (function (sid) {
                            return function () {
                                backpackUIState.equipDetailSlot = sid; window.BackpackPanel && window.BackpackPanel.showEquipment();
                                updateBackpackPanel();
                            };
                        })(slotId);
                    }
                    var unequipBtn = document.createElement('button');
                    unequipBtn.type = 'button';
                    unequipBtn.className = 'btn-unequip';
                    unequipBtn.textContent = window.SceneFeedback.ui(slotId === 'water_flask' ? 'flask.action.unequip' : 'inv.unequip');
                    unequipBtn.disabled = !eq || !eq.item_id;
                    unequipBtn.onclick = (function (sid) {
                        return function (ev) {
                            if (ev && ev.stopPropagation) ev.stopPropagation();
                            if (backpackUIState.equipDetailSlot === sid) backpackUIState.equipDetailSlot = null;
                            if (sid === 'backpack' && window.BackpackSystem) {
                                var liveBag = IE.getState().equipment.backpack;
                                var moved = window.BackpackSystem.transfer({action:'unequip',source:'equipment',index:'backpack',id:liveBag && liveBag.instance_id});
                                window.SceneFeedback.showMsg(moved.message,moved.ok?'success':'warn');updateBackpackPanel();window.SceneMapView.render();return;
                            }
                            var old = IE.unequip(sid, groundPos);
                            if (old) {
                                var placed = IE.putItemIntoDefaultContainer(old);
                                if (!placed.placed) IE.addItemToGround(groundPos.mapId, groundPos.x, groundPos.y, old);
                                window.SceneFeedback.showMsg(window.SceneFeedback.ui('log.info.unequipped'), 'info');
                                window.SceneMapView.markCellDirty(groundPos.mapId, groundPos.x, groundPos.y);
                            }
                            updateBackpackPanel();
                            window.SceneMapView.render();
                        };
                    })(slotId);
                    row.appendChild(unequipBtn);
                    equipList.appendChild(row);
                    // 模块化防具：行下展开模块区（槽点网格 + 装/卸）
                    var tplEq = eqTpl;
                    if (tplEq && Array.isArray(tplEq.module_slots) && tplEq.module_slots.length) {
                        renderModuleArea(equipList, slotId, eq, tplEq);
                    }
                }
            }
        }

        // 槽点显示名（数据契约 38 §1）
        var PLATE_LABELS = {
            'clothing.chest': '胸', 'clothing.abdomen': '腹',
            'clothing.arm_l': '左臂', 'clothing.arm_r': '右臂',
            'clothing.leg_l': '左腿', 'clothing.leg_r': '右腿',
            'head.shell': '盔体', 'head.liner': '内衬', 'head.face': '护面'
        };

        /**
         * 查找占用某槽点的模块（含复合模块反向查找：数据只挂主槽位，occupies 为唯一事实源，契约 38 §4）
         * @returns {{ slotId: string, plateKey: string, inst: object }|null} 数据存储位置 + 实例（卸下用）
         */
        function getModuleOwner(slotId, plateKey) {
            var eq = ieState.equipment[slotId];
            // 直接占用
            if (eq && eq.modules && eq.modules[plateKey]) {
                return { slotId: slotId, plateKey: plateKey, inst: eq.modules[plateKey] };
            }
            // 同底材其他槽点的复合模块 occupies 覆盖该槽点
            if (eq && eq.modules) {
                for (var pk in eq.modules) {
                    var inst = eq.modules[pk];
                    if (!inst || !inst.item_id) continue;
                    var mTpl = IE.getModuleTemplate(inst.item_id);
                    if (mTpl && Array.isArray(mTpl.occupies) && mTpl.occupies.indexOf(slotId + '.' + plateKey) >= 0) {
                        return { slotId: slotId, plateKey: pk, inst: inst };
                    }
                }
            }
            // 跨底材：head 槽点被 clothing 上的复合模块占用
            if (slotId === 'head') {
                var ceq = ieState.equipment.clothing;
                if (ceq && ceq.modules) {
                    for (var pk2 in ceq.modules) {
                        var inst2 = ceq.modules[pk2];
                        if (!inst2 || !inst2.item_id) continue;
                        var mTpl2 = IE.getModuleTemplate(inst2.item_id);
                        if (mTpl2 && Array.isArray(mTpl2.occupies) && mTpl2.occupies.indexOf('head.' + plateKey) >= 0) {
                            return { slotId: 'clothing', plateKey: pk2, inst: inst2 };
                        }
                    }
                }
            }
            return null;
        }

        /** 渲染模块化防具的模块区（槽点网格） */
        function renderModuleArea(equipList, slotId, eq, tpl) {
            var wrap = document.createElement('div');
            wrap.className = 'equip-modules';
            var title = document.createElement('div');
            title.className = 'equip-modules-title';
            title.textContent = window.SceneFeedback.ui('inv.module.title');
            wrap.appendChild(title);
            var grid = document.createElement('div');
            grid.className = 'equip-modules-grid';
            for (var i = 0; i < tpl.module_slots.length; i++) {
                var plate = tpl.module_slots[i];
                var owner = getModuleOwner(slotId, plate);
                var inst = owner ? owner.inst : null;
                var cell = document.createElement('div');
                cell.className = 'equip-module-slot' + (inst ? ' filled' : '');
                var label = PLATE_LABELS[slotId + '.' + plate] || plate;
                if (inst && inst.item_id) {
                    var mTpl = IE.getModuleTemplate(inst.item_id);
                    var mName = mTpl ? mTpl.name : inst.item_id;
                    cell.innerHTML = '<span class="m-label">' + escHtml(label) + '</span><span class="m-name">' + escHtml(mName) + '</span>';
                    var rmBtn = document.createElement('button');
                    rmBtn.type = 'button';
                    rmBtn.className = 'btn-module-remove';
                    rmBtn.textContent = window.SceneFeedback.ui('inv.module.remove');
                    rmBtn.onclick = (function (os, op) {
                        return function () {
                            var res = IE.uninstallModule(os, op);
                            if (res.success && res.item) {
                                var placed = IE.putItemIntoDefaultContainer(res.item);
                                if (!placed.placed) IE.addItemToGround(groundPos.mapId, groundPos.x, groundPos.y, res.item);
                                window.SceneMapView.markCellDirty(groundPos.mapId, groundPos.x, groundPos.y);
                            }
                            updateBackpackPanel();
                            window.SceneMapView.render();
                        };
                    })(owner.slotId, owner.plateKey);
                    cell.appendChild(rmBtn);
                } else {
                    cell.innerHTML = '<span class="m-label">' + escHtml(label) + '</span><span class="m-empty">' + window.SceneFeedback.ui('inv.module.empty') + '</span>';
                    var addBtn = document.createElement('button');
                    addBtn.type = 'button';
                    addBtn.className = 'btn-module-add';
                    addBtn.textContent = window.SceneFeedback.ui('inv.module.install');
                    addBtn.onclick = (function (sid, pk) {
                        return function () { openModulePicker(sid, pk); };
                    })(slotId, plate);
                    cell.appendChild(addBtn);
                }
                grid.appendChild(cell);
            }
            wrap.appendChild(grid);
            equipList.appendChild(wrap);
        }

        /** 打开模块选择弹层：从四类容器过滤可装到该槽点的模块 */
        function openModulePicker(slotId, plateKey) {
            var list = [];
            var sources = [
                { type: 'pocket', arr: IE.getPocketArray ? IE.getPocketArray() : null },
                { type: 'vest', arr: IE.getVestArray ? IE.getVestArray() : null },
                { type: 'backpack', arr: IE.getBackpackArray ? IE.getBackpackArray() : null },
                { type: 'vehicle', arr: IE.getVehicleArray ? IE.getVehicleArray() : null }
            ];
            for (var s = 0; s < sources.length; s++) {
                var src = sources[s];
                if (!src.arr) continue;
                for (var i = 0; i < src.arr.length; i++) {
                    var inst = src.arr[i];
                    if (!inst || !inst.item_id) continue;
                    var mTpl = IE.getModuleTemplate(inst.item_id);
                    if (!mTpl) continue;
                    var installSlots = (Array.isArray(mTpl.install_slots) && mTpl.install_slots.length)
                        ? mTpl.install_slots
                        : (Array.isArray(mTpl.occupies) ? mTpl.occupies : []);
                    if (installSlots.indexOf(slotId + '.' + plateKey) >= 0) {
                        list.push({ type: src.type, index: i, inst: inst, tpl: mTpl });
                    }
                }
            }
            var overlay = document.createElement('div');
            overlay.className = 'module-picker-overlay';
            var box = document.createElement('div');
            box.className = 'module-picker';
            var head = document.createElement('div');
            head.className = 'module-picker-head';
            var label = PLATE_LABELS[slotId + '.' + plateKey] || plateKey;
            head.innerHTML = '<span>' + escHtml(window.SceneFeedback.ui('inv.module.picker_title') + ' · ' + label) + '</span>';
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'bp-close';
            closeBtn.textContent = '✕';
            closeBtn.onclick = function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
            head.appendChild(closeBtn);
            box.appendChild(head);
            if (!list.length) {
                var none = document.createElement('div');
                none.className = 'module-picker-empty';
                none.textContent = window.SceneFeedback.ui('inv.module.picker_none');
                box.appendChild(none);
            } else {
                for (var k = 0; k < list.length; k++) {
                    var entry = list[k];
                    var item = document.createElement('div');
                    item.className = 'module-picker-item';
                    item.innerHTML = '<span class="pi-name">' + escHtml(entry.tpl.name || entry.inst.item_id) + '</span>' +
                        '<span class="pi-desc">' + escHtml(entry.tpl.desc || '') + '</span>';
                    item.onclick = (function (ent) {
                        return function () {
                            var taken = IE.takeItemFromContainer(ent.type, ent.index);
                            if (!taken.success || !taken.item) return;
                            var res = IE.installModule(slotId, plateKey, taken.item);
                            if (!res.success && taken.item) {
                                var placed = IE.putItemIntoDefaultContainer(taken.item);
                                if (!placed.placed) IE.addItemToGround(groundPos.mapId, groundPos.x, groundPos.y, taken.item);
                                window.SceneFeedback.showMsg(res.message || window.SceneFeedback.ui('inv.module.install_fail'), 'error');
                            } else if (res.success) {
                                window.SceneFeedback.showMsg(window.SceneFeedback.ui('inv.module.installed'), 'info');
                            }
                            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                            updateBackpackPanel();
                            window.SceneMapView.render();
                        };
                    })(entry);
                    box.appendChild(item);
                }
            }
            overlay.appendChild(box);
            document.body.appendChild(overlay);
        }

        var carryEl = document.getElementById('backpack-carry');
        if (carryEl) {
            var capBp = (window.CharacterAttributes && typeof window.CharacterAttributes.getCarryCapacity === 'function')
                ? window.CharacterAttributes.getCarryCapacity() : null;
            var curBp = (IE && typeof IE.getCurrentCarryWeight === 'function') ? IE.getCurrentCarryWeight() : null;
            var labBp = window.SceneFeedback.ui('status.label.carry');
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
        var transferHost = document.getElementById('backpack-transfer');
        if (transferHost && window.BackpackPanel) window.BackpackPanel.render(transferHost, {select:function(c,index){
            backpackUIState.container=c.type;backpackUIState.selectedContainer=c.type;backpackUIState.selectedIndex=index;backpackUIState.equipDetailSlot=null;
        }});
    }

    function openGroundItems(id) {
        if (window.SceneAccess.isPreCreationGameplayRestricted() || window.Survival.getState().isDead || window.Survival.getState().isComa) return;
        var pos=E.getState(),items=IE.getGroundItemsAt(pos.mapId,pos.x,pos.y);
        if (!items.length) return;
        var chosen=id?items.find(function(x){return x.instance_id===id;}):items.length===1?items[0]:null;
        if(id&&!chosen)return;
        window.BackpackPanel.ground(chosen&&window.InventoryTransfer.isBackpack(chosen)?chosen.instance_id:null);
        if(!backpackPanelOpen)openBackpackPanel();else updateBackpackPanel();
    }

    function openEquipmentPanel() {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) { window.SceneAccess.showIntroBlockedMsg(); return; }
        window.BackpackPanel.equipment();
        if (backpackPanelOpen) updateBackpackPanel(); else openBackpackPanel();
    }

    function openBackpackPanel(options) {
        if (window.SceneAccess.isPreCreationGameplayRestricted()) {
            window.SceneAccess.showIntroBlockedMsg();
            return;
        }
        if (backpackPanelOpen) return;
        if (!options?.interaction && window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        backpackPanelOpen = true;
        if (window.SveltePanels) window.SveltePanels.refresh('backpack');
        if (!window.SveltePanels) document.getElementById('modal-backpack').classList.add('show');
        updateBackpackPanel();
        window.SceneMapView.render();
    }

    function closeBackpackPanel(options) {
        if (!backpackPanelOpen) return;
        var wasInteraction=window.BackpackPanel && window.BackpackPanel.hasInteraction();
        if (wasInteraction && !window.BackpackPanel.closeInteraction()) return;
        window.BackpackPanel && window.BackpackPanel.invalidate();
        if (options && options.automatic) { backpackPanelOpen=false; if(window.SveltePanels)window.SveltePanels.refresh('backpack');else document.getElementById('modal-backpack').classList.remove('show');return; }
        backpackPanelOpen = false;
        if (!wasInteraction && window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick();
        if (window.SveltePanels) window.SveltePanels.refresh('backpack');
        if (!window.SveltePanels) document.getElementById('modal-backpack').classList.remove('show');
        window.SceneMapView.render();
    }
    function closeGroundBackpackView(){closeBackpackPanel({automatic:true});}

    function initialize() {
        EQUIP_SLOT_LABELS = { head: 'equip.slot.head', clothing: 'equip.slot.clothing', vest: 'equip.slot.vest', backpack: 'equip.slot.backpack', water_flask: 'equip.slot.water_flask', weapon_left: 'equip.slot.weapon_left', weapon_right: 'equip.slot.weapon_right', glove_left: 'equip.slot.glove_left', glove_right: 'equip.slot.glove_right', shoe_left: 'equip.slot.shoe_left', shoe_right: 'equip.slot.shoe_right' };
        EQUIP_SLOT_GROUPS = [
        { label: 'equip.group.strike', slots: ['weapon_left', 'weapon_right', 'glove_left', 'glove_right', 'shoe_left', 'shoe_right'] },
        { label: 'equip.group.armor', slots: ['head', 'clothing'] },
        { label: 'equip.group.carry', slots: ['backpack', 'water_flask'] }
    ];
        backpackPanelOpen = false;
        backpackUIState = {
        container: 'backpack',
        selectedContainer: 'backpack',
        selectedIndex: -1,
        search: '',
        equipDetailSlot: null
    };
    }

    function bind() {

    if (document.getElementById('btn-backpack')) {
        document.getElementById('btn-backpack').addEventListener('click', function () {
            window.SceneApp.navigate('backpack');
        });
    }

    if (document.getElementById('btn-equipment')) document.getElementById('btn-equipment').addEventListener('click', function () { window.SceneApp.navigate('equipment'); });

    if (document.getElementById('player-action-ground-items')) {
        document.getElementById('player-action-ground-items').addEventListener('click', function () {
            openGroundItems();
        });
    }

    if (document.getElementById('backpack-panel-close')) {
        document.getElementById('backpack-panel-close').addEventListener('click', closeBackpackPanel);
    }
    }

    window.InventoryPanel = {
        initialize: initialize,
        bind: bind,
        get EQUIP_SLOT_GROUPS() { return EQUIP_SLOT_GROUPS; },
        get EQUIP_SLOT_LABELS() { return EQUIP_SLOT_LABELS; },
        get backpackPanelOpen() { return backpackPanelOpen; },
        get backpackUIState() { return backpackUIState; },
        closeBackpackPanel: closeBackpackPanel,
        closeGroundBackpackView: closeGroundBackpackView,
        openBackpackPanel: openBackpackPanel,
        openEquipmentPanel: openEquipmentPanel,
        openGroundItems: openGroundItems,
        updateBackpackPanel: updateBackpackPanel
    };
})(window);
