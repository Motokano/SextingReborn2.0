/* Bathroom actions share the world clock, survival state and normal save snapshot. */
(function (g) {
    'use strict';
    var busy = false;
    function isUnlocked() { return !!(g.NPCSystem && g.NPCSystem.isDemoFlagTrue('bathroom_station_unlocked')); }
    function nearby(def) {
        var E = g.GameEngine, p = E && E.getState(), map = E && E.getMap();
        return !!(def && def.bathroom && p && map && (map.npcs || []).some(function (n) {
            return n.npc_id === def.id && Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y)) === 1
                && (p.x === n.x || p.y === n.y || (E.isWalkable(n.x, p.y) && E.isWalkable(p.x, n.y)));
        }));
    }
    function ticks(def, action) {
        var value = def && def.bathroom && def.bathroom[action + '_ticks'];
        return Math.max(1, Math.min(12, Math.floor(Number(value) || (action === 'shower' ? 3 : 1))));
    }
    function reason(def, action, instanceId) {
        if (action !== 'drink' && action !== 'shower' && action !== 'refill') return '没有这个操作。';
        if (busy) return '正在使用卫生间。';
        if (!nearby(def)) return '请靠近卫生间后使用。';
        if (!isUnlocked()) return '请先修好卫生间。';
        if (!g.Survival || !g.SaveSystem || !g.SaveSystem.runAtomic) return '卫生间暂时无法使用，请稍后重试。';
        var s = g.Survival.getState();
        if (s.isDead || s.isComa || (g.BuffSystem && g.BuffSystem.hasBuffByBuffId('player', 'survival_coma'))) return '当前无法使用卫生间。';
        if (g.SceneApp && g.SceneApp.isPreCreationGameplayRestricted()) return '请先完成角色创建。';
        if (g.CombatEngagement && g.CombatEngagement.isPlayerInCombat()) return '请先脱离战斗。';
        if (g.Hunting && g.Hunting.isActive()) return '请先结束当前活动。';
        if (action === 'drink' && s.thirst >= g.Survival.getThirstMax()) return '已经喝足水了。';
        if (action === 'shower' && s.dirtyness <= 0) return '身上已经很干净了。';
        if (action === 'refill') {
            var flasks = g.WaterFlaskStorage;
            if (!flasks) return '暂时无法给水壶装水。';
            if (instanceId) return flasks.reason(instanceId);
            var carried = flasks.carried();
            if (!carried.length) return '随身没有可装水的水壶，带上一只水壶再来。';
            if (carried.every(function (entry) { return !!flasks.reason(entry.instance_id); })) {
                return carried.every(function (entry) { return !entry.profile.error && entry.profile.water >= entry.profile.capacity; })
                    ? '随身的水壶都已经装满了。' : '随身水壶暂时无法装水。';
            }
        }
        return '';
    }
    function use(def, action, instanceId) {
        var blocked = reason(def, action, instanceId);
        if (blocked) return { ok: false, message: blocked };
        if (action === 'refill' && !instanceId) return { ok: false, message: '请先选择要装水的水壶。' };
        if (g.SceneApp.guardPlayerActionBlocked(g.SceneApp.ACTION_TYPES.NPC_INTERACT)) return { ok: false, message: '当前无法使用卫生间。' };
        g.SceneApp.prepareFacilityAction();
        busy = true;
        var result;
        try {
            var transaction = g.SaveSystem.runAtomic(function () {
                var S = g.Survival, count = ticks(def, action);
                // Drink immediately so arriving on the last dehydration tick can still save the player.
                if (action === 'drink') S.addThirst(S.getThirstMax());
                for (var i = 0; i < count; i++) {
                    S.advanceTick({ source: 'bathroom_' + action });
                    var state = S.getState();
                    if (state.isDead || state.isComa || !nearby(def) || !isUnlocked()
                        || (g.BuffSystem && g.BuffSystem.hasBuffByBuffId('player', 'survival_coma'))
                        || (g.CombatEngagement && g.CombatEngagement.isPlayerInCombat())) {
                        return { ok: false, message: '使用中断，已度过的时间仍然有效。' };
                    }
                }
                if (action === 'refill') return g.WaterFlaskStorage.fillCarried(instanceId);
                if (action === 'drink') S.addThirst(S.getThirstMax());
                else S.reduceDirtyness(S.getDirtyness());
                return { ok: true, message: action === 'drink' ? '喝足了干净的饮用水。' : '洗去了身上的污垢，整个人清爽了许多。' };
            });
            result = transaction.saved ? transaction.value : { ok: false, message: '保存失败，本次使用未生效，请重试。' };
        } finally {
            busy = false;
            if (g.SceneHud) g.SceneHud.refresh('status');
            if (g.SceneRenderer) g.SceneRenderer.render();
        }
        return result;
    }
    g.BathroomFacility = { nearby: nearby, ticks: ticks, reason: reason, use: use, isUnlocked: isUnlocked };
})(window);
