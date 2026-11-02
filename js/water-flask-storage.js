/* Storage actions on real inventory instances; no prototype saves or item grants. */
(function (g) {
    'use strict';
    function profile(instance) {
        var IE = g.InventoryEquipment, A = g.ItemAttributeModules;
        var tpl = instance && IE && IE.getItemTemplate(instance.item_id);
        if (!tpl || !A || !A.hasGroup(tpl, 'structure', 'liquid_storage')) return null;
        var capacity = A.getTemplateValue(tpl, 'flask_capacity');
        var multiplier = A.getTemplateValue(tpl, 'flask_source_multiplier');
        var water = A.getInstanceValue(instance, tpl, 'flask_water');
        var state = instance.attribute_state && instance.attribute_state.structure && instance.attribute_state.structure.liquid_storage;
        var error = '';
        if (state !== undefined && (!state || state.version !== 1)) error = '水壶存水记录暂时无法读取。';
        if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(multiplier) || multiplier <= 0
            || !Number.isFinite(water) || water < 0 || water > capacity) error = '水壶存水记录暂时无法读取。';
        if (instance.count != null && instance.count !== 1) error = '请先将水壶逐只分开。';
        return { capacity: capacity, multiplier: multiplier, water: water, error: error };
    }
    function carried() {
        var IE = g.InventoryEquipment;
        if (!IE) return [];
        var result = [], character = IE.getCharacterForDisplay();
        function add(instance, location) {
            var p = profile(instance);
            if (!p || !instance.instance_id) return;
            var tpl = IE.getItemTemplate(instance.item_id);
            result.push({ instance_id: instance.instance_id, instance: instance, location: location,
                name: IE.getDisplayName(tpl, IE.getItemDisplayTier(instance.item_id, character), character), profile: p });
        }
        [['口袋', IE.getPocketArray()], ['旧式收纳', IE.getVestArray()], ['背包', IE.getBackpackArray()]].forEach(function (container) {
            container[1].forEach(function (instance, index) { add(instance, container[0] + '第' + (index + 1) + '格'); });
        });
        var equipment = IE.getState().equipment;
        IE.EQUIP_SLOT_IDS.forEach(function (slot) { add(equipment[slot], '已装备'); });
        return result;
    }
    function findCarried(instanceId) {
        return carried().find(function (entry) { return entry.instance_id === instanceId; }) || null;
    }
    function reason(instanceId) {
        var entry = findCarried(instanceId);
        if (!entry) return '这只水壶已不在随身物品中。';
        if (entry.profile.error) return entry.profile.error;
        if (entry.profile.water >= entry.profile.capacity) return '这只水壶已经装满了。';
        return '';
    }
    // Pure plan: source supply and stored water are distinct. A future finite source must
    // debit source_used in the same transaction as this gain; bathroom supply is abundant.
    function plan(instance, availableWater) {
        var p = profile(instance);
        if (!p || p.error) return { ok: false, message: p ? p.error : '这件物品不能装水。' };
        if (availableWater !== Infinity && (!Number.isFinite(availableWater) || availableWater < 0)) return { ok: false, message: '水源暂时无法使用。' };
        var nextWater = Math.min(p.capacity, p.water + availableWater * p.multiplier);
        var gain = nextWater - p.water;
        return { ok: gain > 0, water: nextWater, gained: gain, source_used: gain / p.multiplier,
            message: gain > 0 ? '' : (p.water >= p.capacity ? '这只水壶已经装满了。' : '水源已经用完了。') };
    }
    function fillCarried(instanceId) {
        var blocked = reason(instanceId);
        if (blocked) return { ok: false, message: blocked };
        // Resolve again after time advancement: a removed/replaced flask is never recreated.
        var entry = findCarried(instanceId);
        var record = g.InventoryEquipment.findItemInstanceRecord(instanceId);
        if (!record) return { ok: false, message: '这只水壶已不在随身物品中。' };
        var fill = plan(record.instance, Infinity);
        if (!fill.ok || !g.InventoryEquipment.setItemInstanceValue(record.instance, 'flask_water', fill.water)) {
            return { ok: false, message: fill.message || '水壶存水记录暂时无法写入。' };
        }
        fill.message = '已将' + entry.name + '装满（' + format(fill.water) + '／' + format(entry.profile.capacity) + '）。';
        return fill;
    }
    function format(value) { return Number.isFinite(value) ? String(Number(value.toFixed(4))) : '未知'; }
    g.WaterFlaskStorage = { profile: profile, carried: carried, reason: reason, plan: plan, fillCarried: fillCarried, format: format };
})(window);
