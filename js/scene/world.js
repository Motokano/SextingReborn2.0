/**
 * WorldTick — 世界时间推进及各系统后置结算顺序.
 * 规则归属与变更要求：docs/architecture/scene-entry.md。
 * 从当前场景实现按职责迁移；存档键、结算顺序与公开兼容出口保持。
 */
(function (window) {
    var E = window.GameEngine;

    function advanceWorldTicks(n, options) {
        var times = parseInt(n, 10);
        if (!isFinite(times) || times <= 0) return;
        var i;
        for (i = 0; i < times; i++) {
            if (window.Survival && typeof window.Survival.advanceTick === 'function') window.Survival.advanceTick(options);
        }
    }

    function resolveNpcHardOccupancyAfterWorldTick() {
        if (!E || typeof E.getState !== 'function' || typeof E.getMap !== 'function' || typeof E.setState !== 'function') return false;
        if (!window.NPCSystem || typeof window.NPCSystem.isNpcPresentNow !== 'function') return false;
        var st = E.getState();
        var map = E.getMap();
        if (!st || !map || !Array.isArray(map.npcs) || !map.npcs.length) return false;

        var px = st.x | 0;
        var py = st.y | 0;
        var i;
        for (i = 0; i < map.npcs.length; i++) {
            var n = map.npcs[i];
            if (!n) continue;
            var nx = n.x | 0;
            var ny = n.y | 0;
            if (nx !== px || ny !== py) continue;
            var npcId = n.npc_id != null ? String(n.npc_id) : '';
            if (!npcId) continue;
            if (!window.NPCSystem.isNpcPresentNow(npcId)) continue;
            var target = StationContext.findAdjacentStandableCellAround(nx, ny);
            if (!target) {
                window.SceneFeedback.showMsg(window.SceneFeedback.ui('scene.msg.npc_occupy_conflict'), 'warn');
                return false;
            }
            E.setState(st.mapId, target.x, target.y);
            if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                window.SceneCtx.pushDirtyCell(nx, ny);
                window.SceneCtx.pushDirtyCell(target.x, target.y);
            }
            window.SceneFeedback.showMsg(window.SceneFeedback.ui('scene.msg.npc_pushed_away'), 'info');
            return true;
        }
        return false;
    }

    /** 主世界 tick 唯一权威：GameTime.totalTicks（存档 time.totalTicks）；Survival.tickCount 仅作未加载 GameTime 时的回退。 */
    function getWorldTotalTicks() {
        if (window.GameTime && typeof window.GameTime.getState === 'function') {
            var ts = window.GameTime.getState();
            if (ts && typeof ts.totalTicks === 'number' && isFinite(ts.totalTicks)) {
                return Math.max(0, Math.floor(ts.totalTicks));
            }
        }
        if (window.Survival && typeof window.Survival.getState === 'function') {
            var ss = window.Survival.getState();
            if (ss && ss.tickCount != null) return Math.max(0, Math.floor(Number(ss.tickCount) || 0));
        }
        return 0;
    }

    /** agriculture_map.state.tick 仅为世界时间的镜像，禁止独立递增。 */
    function patchSurvivalTickForWorldSystemsOnce() {
        if (!window.Survival || typeof window.Survival.advanceTick !== 'function') return;
        if (window.Survival.__worldSystemsTickPatched) return;
        var oldAdvance = window.Survival.advanceTick;
        window.Survival.advanceTick = function () {
            if (window.Survival.isDead() || (window.DeathSystem && window.DeathSystem.blocked())) return { isDead: true };
            if (window.BedSleep && !window.BedSleep.allowsTick(arguments[0])) return { sleeping: true };
            if (window.GymSystem && !window.GymSystem.allowsTick(arguments[0])) return { training: true };
            if (window.MedicalActions && !window.MedicalActions.allowsTick(arguments[0])) return { medical: true };
            if (window.ManufacturingActions && !window.ManufacturingActions.allowsTick(arguments[0])) return { manufacturing: true };
            var tickSource = arguments[0] && arguments[0].source;
            if (window.PlayerActions.restIdleTimer && tickSource && ['rest', 'sleep', 'hunting', 'dungeon'].indexOf(tickSource) < 0) {
                window.PlayerActions.setRestingActionActive(false, { showMsg: false });
            }
            var before = window.Survival.getState();
            if (before.isResting && arguments[0]?.source !== 'sleep' && !window.SaveSystem.isAtomic()) {
                var restOptions=arguments[0],restResult=window.SaveSystem.runAtomicFor('rest',function(){return window.Survival.advanceTick(restOptions);});
                if(!restResult.saved){window.PlayerActions.setRestingActionActive(false,{showMsg:false});window.SceneFeedback.showMsg('保存失败，已暂停休息，本刻消耗、恢复和经验已还原。','warn');}
                return restResult.value;
            }
            if (PharmacyStation.getActiveCraft()?.method_id==='life_pharmacy.medical_alcohol'&&!window.SaveSystem.isAtomic()) {
                var tickOptions=arguments[0],saved=window.SaveSystem.runAtomicFor('craft.pharmacy',function(){return window.Survival.advanceTick(tickOptions);});
                if(!saved.saved){window.StationActions.stopPharmacyCraftIdle();window.SceneFeedback.showMsg('保存失败，酒精制作进度已恢复，请重新打开制药台继续。','warn');}
                return saved.value;
            }
            if (window.BookReading) window.BookReading.beforeWorldTick();
            var worldTickBefore = getWorldTotalTicks();
            var ret = oldAdvance.apply(this, arguments);
            // A rejected tick must not advance production, growth or other world consumers.
            if (getWorldTotalTicks() <= worldTickBefore) return ret;
            if (!window.Survival.isDead()) {
                var after = window.Survival.getState();
                if (!before.isComa && after.isComa) {
                    window.PlayerActions.prepareFacilityAction();
                    if (window.NPCSystem?.isMenuOpen()) window.NPCSystem.menu.close();
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('survival.fatigue.coma', {ticks: after.fatigueComaTicksRemaining}), 'warn');
                } else if (before.isComa && !after.isComa) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('survival.fatigue.awake', {fatigue: after.fatigue, stamina: after.stamina}), 'info');
                } else if (after.fatigueFullTicks === 1 && !before.fatigueFullTicks) {
                    window.SceneFeedback.showMsg(window.SceneFeedback.ui('survival.fatigue.full_warning', {ticks: window.Survival.getConfigValue('fatigue_full_ticks_to_coma', 30)}), 'warn');
                }
            }
            try { resolveNpcHardOccupancyAfterWorldTick(); } catch (e2) { /* ignore */ }
            try { CookingStation.tickCookingTempStationsAfterWorldTick(); } catch (e1) { /* ignore */ }
            var attendedSource = before.isComa ? null : arguments[0]?.source;
            var alive = !window.Survival.isDead();
            try {
                if (alive && (attendedSource === 'cooking_work' || StationCraftCore.advancesUnattended(CookingStation.getActiveCraft()))) CookingStation.tickCraftAfterWorldTick();
            } catch (e0) { /* ignore */ }
            try { window.StationActions.tickPharmacyTempStationsAfterWorldTick(); } catch (eP1) { /* ignore */ }
            try {
                if (alive && (attendedSource === 'pharmacy_work' || StationCraftCore.advancesUnattended(PharmacyStation.getActiveCraft()))) PharmacyStation.tickCraftAfterWorldTick();
            } catch (eP0) { /* ignore */ }
            try {
                if (window.CompostSystem && typeof window.CompostSystem.onWorldTick === 'function') {
                    window.CompostSystem.onWorldTick();
                }
            } catch (e3) { /* ignore */ }
            try {
                if (window.CompostPanel && typeof window.CompostPanel.refreshIfOpen === 'function') window.CompostPanel.refreshIfOpen();
            } catch (e4) { /* ignore */ }
            try { window.WarehouseActions.tickHideoutWarehouseAfterWorldTick(); } catch (eHwTick) { /* ignore */ }
            try { window.AgricultureActions.tickAgricultureAfterWorldTick(before.isComa, arguments[0]?.source); } catch (eAg) { /* ignore */ }
            try { window.LivestockActions.tickLivestockAfterWorldTick(); } catch (eLs) { /* ignore */ }
            try { CombatWorld.tickEnemiesAfterWorldTick(); } catch (eEn) { /* ignore */ }
            if (window.DungeonRuntime) window.DungeonRuntime.afterTick();
            if (CombatWorld.flushDisplacements) CombatWorld.flushDisplacements();
            try { CombatWorld.tickPlayerStunDecay(); } catch (eStunD) { /* ignore */ }
            // 制药：成瘾衰减/阶段压制刷新 + 毒性代谢 + 致死倒计时（47 §4/§9.2，k242/k240）
            try {
                if (window.PharmacyEffects && typeof window.PharmacyEffects.onWorldTick === 'function') {
                    window.PharmacyEffects.onWorldTick();
                }
            } catch (ePharmTick) { /* ignore */ }
            // 09「损毁恢复」：部位损毁自然自愈（宽限后按部位速率回落，休息加速）
            try {
                if (window.CharacterAttributes && typeof window.CharacterAttributes.onWorldTickDestroyRecover === 'function') {
                    window.CharacterAttributes.onWorldTickDestroyRecover(arguments[0]);
                }
            } catch (ePartRecover) { /* ignore */ }
            return ret;
        };
        window.Survival.__worldSystemsTickPatched = true;
        window.Survival.__cookingCraftPatched = true;
        window.Survival.__pharmacyCraftPatched = true;
    }

    function patchSurvivalTickForCookingCraftOnce() {
        patchSurvivalTickForWorldSystemsOnce();
    }

    function patchSurvivalTickForPharmacyCraftOnce() {
        patchSurvivalTickForWorldSystemsOnce();
    }

    function initialize() {

    }

    function bind() {

    }

    window.WorldTick = {
        initialize: initialize,
        bind: bind,
        advanceWorldTicks: advanceWorldTicks,
        getWorldTotalTicks: getWorldTotalTicks,
        patchSurvivalTickForCookingCraftOnce: patchSurvivalTickForCookingCraftOnce,
        patchSurvivalTickForPharmacyCraftOnce: patchSurvivalTickForPharmacyCraftOnce,
        patchSurvivalTickForWorldSystemsOnce: patchSurvivalTickForWorldSystemsOnce
    };
})(window);
