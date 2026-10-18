// Inventory queries expose only already-filtered display text. Commands re-resolve
// the instance before acting, so an old selection cannot consume a replacement.
export function inventoryPanel(g, publish, t) {
    const api = g.SceneApp.panelApi, IE = g.InventoryEquipment, state = api.backpackState;
    let picker = null, warehouseFilter = '', nextToken = 0;
    const tokens = new WeakMap();
    function token(item) { if (!tokens.has(item)) tokens.set(item, ++nextToken); return tokens.get(item); }
    function item(r) { return array(r.source)[r.index]; }
    const sources = ['pocket', 'vest', 'backpack', 'vehicle', 'ground'];
    const plates = { 'clothing.chest': '胸', 'clothing.abdomen': '腹', 'clothing.arm_l': '左臂', 'clothing.arm_r': '右臂', 'clothing.leg_l': '左腿', 'clothing.leg_r': '右腿', 'head.shell': '盔体', 'head.liner': '内衬', 'head.face': '护面' };
    function array(source) { const p = api.position(); return source === 'ground' ? IE.getGroundItemsAt(p.mapId, p.x, p.y) : source === 'equipment' ? IE.getState().equipment : IE['get' + source[0].toUpperCase() + source.slice(1) + 'Array']?.() || []; }
    function ref(source, index) { const it = array(source)[index]; return it ? { source, index, token: token(it), id: it.instance_id, itemId: it.item_id, pos: source === 'ground' ? { ...api.position() } : null } : null; }
    function valid(r) { if (!r)
        return false; const now = array(r.source)[r.index], p = api.position(); return !!now && (r.id ? now.instance_id === r.id : token(now) === r.token) && now.item_id === r.itemId && (!r.pos || (r.pos.mapId === p.mapId && r.pos.x === p.x && r.pos.y === p.y)); }
    function display(r) {
        const it = item(r), character = IE.getCharacterForDisplay(), tpl = IE.getItemTemplate(it.item_id), tier = IE.getItemDisplayTier(it.item_id, character);
        let name = tpl ? IE.getDisplayName(tpl, tier, character) : it.item_id;
        if ((it.sewing || it.sewing_parts) && g.SewingSystem)
            name = g.SewingSystem.itemName(it);
        return { ref: r, name, desc: tpl ? IE.getDisplayDesc(tpl, tier, character) : '', qty: it.count > 1 ? ' x' + it.count : '', meta: it.item_id, tooltip: g.SceneUi.buildItemTooltipView(it.item_id, tpl, it, character), tpl };
    }
    function owner(slot, plate) {
        const eq = IE.getState().equipment, direct = eq[slot]?.modules?.[plate];
        if (direct)
            return { slot, plate, token: token(direct), itemId: direct.item_id };
        for (const sid of slot === 'head' ? ['head', 'clothing'] : [slot])
            for (const [pk, it] of Object.entries(eq[sid]?.modules || {})) {
                if (it?.item_id && IE.getModuleTemplate(it.item_id)?.occupies?.includes(slot + '.' + plate))
                    return { slot: sid, plate: pk, token: token(it), itemId: it.item_id };
            }
        return null;
    }
    function assembly(it, interactive) {
        const d = g.ItemAssemblyDisplay, character = IE.getCharacterForDisplay(), view = d?.buildView(it, character);
        if (!view)
            return null;
        function node(n) { return n.slots.map(s => ({ id: s.slot_id, label: s.label, host: n.instance.instance_id, child: s.child ? { name: s.child.name, slots: node(s.child) } : null, candidates: interactive && !s.child ? d.listCompatibleCandidates(n.instance, s.slot_id, character).map(c => ({ ...c, value: c.source + ':' + c.index, ref: ref(c.source, c.index) })) : [] })); }
        return { complete: view.complete, interactive: interactive && !view.readOnly, slots: node(view.root) };
    }
    function read() {
        if (!api.getOpen('backpack'))
            return { open: false, picker: null };
        const hasVehicle = !!IE.getState().bound_vehicle_id;
        let rows = (state.container === 'vehicle' && !hasVehicle ? [] : array(state.container)).map((it, i) => it?.item_id ? display(ref(state.container, i)) : null).filter(Boolean);
        const search = state.search.trim().toLowerCase();
        if (search)
            rows = rows.filter(r => (r.name + ' ' + r.meta + ' ' + r.desc).toLowerCase().includes(search));
        let selected = state.selectedContainer === state.container ? rows.find(r => r.ref.index === state.selectedIndex) : null;
        if (!selected && rows.length) {
            selected = rows[0];
            state.selectedContainer = state.container;
            state.selectedIndex = selected.ref.index;
        }
        rows.forEach(r => r.selected = r === selected);
        if (state.equipDetailSlot != null) {
            const r = ref('equipment', state.equipDetailSlot);
            if (r?.itemId)
                selected = display(r);
            else
                state.equipDetailSlot = null;
        }
        let detail = null;
        if (selected) {
            const r = selected.ref, tpl = selected.tpl, tooltip = selected.tooltip;
            detail = { ...selected, attrs: g.SceneUi.formatItemAttributes(tpl, item(r)), modules: tooltip.filter(n => n.className === 'tooltip-modules'), fields: tooltip.filter(n => n.className?.includes('tooltip-field')), assembly: assembly(item(r), r.source !== 'ground'), actions: [] };
            const add = (label, command, part) => detail.actions.push({ label, command, part });
            if (r.source === 'equipment')
                add(t('inv.unequip'), 'unequip');
            else if (r.source === 'ground') {
                add(t('inv.pickup'), 'pickup');
                if (g.ModularWeaponCombat?.isWeapon(item(r))) {
                    add('右手持用', 'equip', 'weapon_right'); add('左手持用', 'equip', 'weapon_left');
                } else if (tpl?.equip_slot) add(t('inv.equip'), 'equip');
            }
            else {
                if (g.ItemUse.itemTemplateIsConsumable(tpl)) {
                    if (g.ItemUse.getUseActionRoute(tpl) === 'topical') {
                        detail.partHint = t('item.use.pick_part');
                        for (const part of g.ItemUse.BODY_PART_IDS || api.bodyParts)
                            add(t('item.use.topical') + ' ' + t(api.bodyLabels[part] || part), 'use', part);
                    }
                    else
                        add(t('inv.use'), 'use');
                }
                if (g.ModularWeaponCombat?.isWeapon(item(r))) {
                    add('右手持用', 'equip', 'weapon_right'); add('左手持用', 'equip', 'weapon_left');
                } else if (tpl?.equip_slot) add(t('inv.equip'), 'equip');
                add(t('inv.drop'), 'drop');
            }
        }
        const groups = api.equipGroups.map(group => ({ label: t(group.label), slots: group.slots.filter(s => IE.EQUIP_SLOT_IDS.includes(s)).map(slot => {
                const r = ref('equipment', slot), has = !!r?.itemId, d = has ? display(r) : null, tpl = d?.tpl;
                return { slot, ref: r, label: t(api.equipLabels[slot] || slot), name: has ? (tpl ? IE.getDisplayName(tpl, IE.getItemDisplayTier(r.itemId, IE.getCharacterForDisplay()), IE.getCharacterForDisplay()) : r.itemId) : t('common.dash'), has, selected: has && state.equipDetailSlot === slot, tooltip: d?.tooltip || [], modules: (tpl?.module_slots || []).map(plate => { const o = owner(slot, plate); return { slot, plate, label: plates[slot + '.' + plate] || plate, owner: o, name: o ? (IE.getModuleTemplate(o.itemId)?.name || o.itemId) : '', host: r }; }) };
            }) }));
        for (const row of rows) delete row.tpl;
        if (detail) delete detail.tpl;
        const cap = g.CharacterAttributes?.getCarryCapacity(), cur = IE.getCurrentCarryWeight();
        return { open: true, search: state.search, container: state.container, tabs: sources.filter(s => s !== 'vehicle' || hasVehicle).map(id => ({ id, label: t('inv.' + id) })), title: t('inv.' + state.container), carry: t('status.label.carry') + ' ' + (cap != null ? (cur != null ? cur.toFixed(1) : '—') + ' / ' + cap.toFixed(1) + ' kg' : '—'), rows, detail, groups, picker };
    }
    function refresh() { publish('backpack', read()); }
    function changed() { refresh(); api.changed(); }
    function put(it) { if (it && !IE.putItemIntoDefaultContainer(it)?.placed) {
        const p = api.position();
        IE.addItemToGround(p.mapId, p.x, p.y, it);
    } }
    function action(r, command, part) {
        if (!api.getOpen('backpack') || !valid(r)) {
            refresh();
            return;
        }
        const p = api.position(), tpl = IE.getItemTemplate(r.itemId);
        let result;
        if (command === 'use') {
            api.use(r.source, r.index, part ? { part_id: part } : undefined);
            refresh();
            return;
        }
        if (command === 'unequip') {
            put(IE.unequip(r.index, p));
            state.equipDetailSlot = null;
            api.message(t('log.info.unequipped'), 'info');
        }
        else if (command === 'drop' || command === 'pickup' || r.source === 'ground' && !g.ModularWeaponCombat?.isWeapon(item(r))) {
            result = command === 'drop' ? IE.dropItemToGround(r.source, r.index, p.mapId, p.x, p.y) : command === 'pickup' ? IE.pickUpFromGround(p.mapId, p.x, p.y, r.index) : IE.equipFromGround(p.mapId, p.x, p.y, r.index);
            if (result?.success)
                api.message(t(command === 'drop' ? 'log.info.dropped' : command === 'pickup' ? 'log.success.picked' : 'log.success.equipped'), command === 'drop' ? 'info' : 'success');
            else if (result?.message)
                api.message(result.message, 'warn');
        }
        else if (command === 'equip' && tpl?.equip_slot) {
            const slot = g.ModularWeaponCombat?.isWeapon(item(r)) ? (part || 'weapon_right') : tpl.equip_slot;
            if (g.ModularWeaponCombat?.isWeapon(item(r))) {
                const validation=g.ModularWeaponCombat.validateEquip(item(r),slot);
                if(!validation.success){api.message(validation.message,'warn');return;}
            }
            const groundItem = r.source === 'ground' ? IE.removeItemFromGround(p.mapId,p.x,p.y,r.index) : null;
            const taken = r.source === 'ground' ? {success:!!groundItem,item:groundItem} : IE.takeItemFromContainer(r.source, r.index);
            if (!taken.success || !taken.item)
                return;
            const it = taken.item;
            if (it.count != null)
                it.count = 1;
            if (IE.getState().equipment[slot])
                put(IE.unequip(slot, p));
            result = IE.equip(slot, it);
            if (!result?.success) {
                put(it);
                api.message(result?.message || t('inv.equip'), 'warn');
            }
            else
                api.message(t('log.success.equipped'), 'success');
        }
        changed();
    }
    function moduleAction(m) {
        if (!valid(m.host)) {
            refresh();
            return;
        }
        if (m.owner) {
            const current = owner(m.slot, m.plate);
            if (!current || current.token !== m.owner.token) {
                refresh();
                return;
            }
            const result = IE.uninstallModule(current.slot, current.plate);
            if (result.success && result.item)
                put(result.item);
            changed();
            return;
        }
        const entries = [];
        for (const source of sources.filter(s => s !== 'ground'))
            array(source).forEach((it, i) => { if (!it?.item_id)
                return; const tpl = IE.getModuleTemplate(it.item_id), slots = tpl?.install_slots?.length ? tpl.install_slots : tpl?.occupies; if (slots?.includes(m.slot + '.' + m.plate))
                entries.push({ ref: ref(source, i), name: tpl.name || it.item_id, desc: tpl.desc || '' }); });
        picker = { title: t('inv.module.picker_title') + ' · ' + m.label, entries, target: m };
        refresh();
    }
    function install(entry) { if (!picker || !valid(picker.target.host) || !valid(entry.ref)) {
        picker = null;
        refresh();
        return;
    } const target = picker.target; picker = null; const taken = IE.takeItemFromContainer(entry.ref.source, entry.ref.index); if (!taken.success || !taken.item) {
        refresh();
        return;
    } const result = IE.installModule(target.slot, target.plate, taken.item); if (!result.success) {
        put(taken.item);
        api.message(result.message || t('inv.module.install_fail'), 'error');
    }
    else
        api.message(t('inv.module.installed'), 'info'); changed(); }
    function connect(slot, candidate) { if (!api.getOpen('backpack') || candidate && !valid(candidate.ref)) {
        refresh();
        return;
    } const A = g.ItemAssembly; const result = candidate ? A.attachFromContainer(slot.host, slot.id, candidate.source, candidate.index) : A.detachToInventory(slot.host, slot.id); api.message(result?.ok ? t(candidate ? 'item.assembly.message.attached' : 'item.assembly.message.detached') : g.ItemAssemblyDisplay.messageForReason(result?.reason), result?.ok ? (candidate ? 'success' : 'info') : 'warn'); changed(); }
    function warehouse(filter) { if (filter !== undefined)
        warehouseFilter = filter; const open = api.getOpen('warehouse'); publish('warehouse', { open, filter: warehouseFilter, rows: open ? IE.getAllItemIds().map(id => { const tpl = IE.getItemTemplate(id), c = IE.getCharacterForDisplay(), tier = IE.getItemDisplayTier(id, c), name = (tpl && IE.getDisplayName(tpl, tier, c)) || tpl?.sn || tpl?.placeholder_name || t('hideout_warehouse.item.unknown'); return { id, name, tooltip: g.SceneUi.buildItemTooltipView(id, tpl, null, c) }; }).filter(r => !warehouseFilter || (r.id + ' ' + r.name).toLowerCase().includes(warehouseFilter.trim().toLowerCase())) : [] }); }
    return { refresh, warehouse, action, moduleAction, install, connect, closePicker() { picker = null; refresh(); }, select(r) { if (!valid(r))
            return; state.equipDetailSlot = r.source === 'equipment' ? r.index : null; if (r.source !== 'equipment') {
            state.selectedContainer = state.container;
            state.selectedIndex = r.index;
        } refresh(); }, tab(id) { if (!sources.includes(id))
            return; state.container = id; state.selectedContainer = id; state.selectedIndex = -1; refresh(); }, search(value) { state.search = value; state.selectedIndex = -1; refresh(); }, take(id) { if (api.getOpen('warehouse'))
            api.takeWarehouse(id); } };
}
