/* Reusable equipment action: debit liquid, never consume or replace the flask. */
(function (g) {
    'use strict';
    var busy = false;
    function equipped(instanceId) {
        var IE = g.InventoryEquipment, item = IE && IE.getState().equipment.water_flask;
        if (!item || !item.instance_id || (instanceId && item.instance_id !== instanceId)) return null;
        var record = IE.findItemInstanceRecord(item.instance_id);
        return record && record.instance;
    }
    function profile(item) {
        var IE = g.InventoryEquipment, tpl = item && IE.getItemTemplate(item.item_id);
        var storage = g.WaterFlaskStorage && g.WaterFlaskStorage.profile(item);
        if (!tpl || !storage || IE.getItemTemplateValue(tpl, 'equip_slot') !== 'water_flask') return null;
        var cost = IE.getItemTemplateValue(tpl, 'flask_drink_cost');
        var ticks = IE.getItemTemplateValue(tpl, 'flask_drink_ticks');
        var effects = IE.getItemTemplateValue(tpl, 'flask_effects');
        // Unsupported future effects must fail closed, never silently become thirst recovery.
        var valid = Number.isFinite(cost) && cost > 0 && cost <= storage.capacity
            && Number.isInteger(ticks) && ticks >= 1 && ticks <= 12
            && Array.isArray(effects) && effects.length && effects.every(function (effect) {
                return effect && effect.target === 'thirst' && effect.timing === 'instant' && effect.duration_ticks === 0
                    && Number.isFinite(effect.total) && effect.total > 0;
            });
        return { cost: cost, ticks: ticks, effects: effects, water: storage.water, capacity: storage.capacity,
            error: storage.error || (valid ? '' : '这只水壶的饮用效果暂时无法使用。') };
    }
    function reason(instanceId) {
        if (busy) return '正在从水壶饮用。';
        if (!g.Survival || !g.SaveSystem || !g.SaveSystem.runAtomic || !g.SceneApp) return '暂时无法从水壶饮用。';
        var S = g.Survival, state = S.getState();
        if (state.isDead || state.isComa || (g.BuffSystem && g.BuffSystem.hasBuffByBuffId('player', 'survival_coma'))) return '当前无法饮水。';
        if (g.SceneApp.isPreCreationGameplayRestricted()) return '请先完成角色创建。';
        if (g.SceneApp.isStoryMovementLocked()) return '请先完成当前对话。';
        if (g.Hunting && g.Hunting.isActive()) return '请先结束当前活动。';
        if (g.BuffSystem && g.BuffSystem.hasActionDisabled('player', 'item_use')) return '当前无法使用物品。';
        var item = equipped(instanceId);
        if (!item) return instanceId ? '这只水壶已不在水壶槽中。' : '请先在装备栏装备一只水壶。';
        var p = profile(item);
        if (!p) return '这件装备不能用来饮水。';
        if (p.error) return p.error;
        if (p.water < p.cost) return p.water === 0 ? '水壶已空，请到水源装水。' : '壶内存水不足一口，请先补水。';
        if (state.thirst >= S.getThirstMax()) return '已经喝足水了。';
        return '';
    }
    function drink(instanceId) {
        var blocked = reason(instanceId);
        if (blocked) return { ok: false, message: blocked };
        busy = true;
        try {
            var transaction = g.SaveSystem.runAtomic(function () {
                if (g.SceneApp.guardPlayerActionBlocked(g.SceneApp.ACTION_TYPES.ITEM_USE)) return { ok: false, message: '当前无法饮水。' };
                var item = equipped(instanceId), p = profile(item);
                if (!item || !p || p.error || p.water < p.cost) return { ok: false, message: '水壶状态已改变，请重试。' };
                g.SceneApp.prepareFacilityAction();
                if (!g.InventoryEquipment.setItemInstanceValue(item, 'flask_water', p.water - p.cost)) throw new Error('Flask liquid write failed');
                p.effects.forEach(function (effect) { g.Survival.addThirst(effect.total); });
                for (var i = 0; i < p.ticks; i++) {
                    g.Survival.advanceTick({ source: 'water_flask_drink' });
                    var state = g.Survival.getState();
                    if (state.isDead || state.isComa || (g.BuffSystem && g.BuffSystem.hasBuffByBuffId('player', 'survival_coma'))) break;
                }
                return { ok: true, message: '从水壶喝了一口水，消耗' + g.WaterFlaskStorage.format(p.cost) + '点存水。' };
            });
            return transaction.saved ? transaction.value : { ok: false, message: '保存失败，本次饮用未生效，请重试。' };
        } catch (error) {
            return { ok: false, message: '饮用未完成，已恢复使用前的状态，请重试。' };
        } finally {
            busy = false;
            if (g.SceneHud) g.SceneHud.refresh('status');
            if (g.SceneRenderer) g.SceneRenderer.render();
        }
    }
    g.WaterFlaskUse = { equipped: equipped, profile: profile, reason: reason, drink: drink };
})(window);
