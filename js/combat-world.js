/**
 * CombatWorld — 敌人世界模拟（scene-app 组合根化拆解 P2）
 *
 * 来源：自 js/scene-app.js 迁出（敌人世界 tick/击杀落地/电池掉落/反击标记/主动攻击/眩晕衰减 8 函数 + 反击去重标记状态）。
 * 语义零变：只做「世界侧场景落地」，纯决策仍在 window.CombatEnemies.updateEnemyAI 等模块内。
 *
 * 职责：
 * - tickEnemiesAfterWorldTick：每世界 tick 移动敌人（改写 map.enemies + 脏格）+ 贴脸主动攻击（复用玩家受击管线）。
 * - settleEnemyKills / settleEnemyBatteryDrops：死亡队列落地（移除实例、日志、电池掉落 k89）。
 * - buildEnemyCounterAtkCtx：构建「玩家受击」管线上下文（反击与 AI 主动攻击共用）。
 * - enemyCounterAttackFlags：本动作内已反击去重标记（transient；AI 每 tick 消费后清空）。
 * - tickPlayerStunDecay：玩家眩晕 -1/tick。
 *
 * 依赖注入：setUiDeps({ ui, getWorldTotalTicks })（ui=文案取词，getWorldTotalTicks=世界 tick 计数）。
 * 模块内 E/IE 为 window.GameEngine / window.InventoryEquipment 别名（与 scene-app 闭包别名语义一致）。
 */
(function (global) {
    'use strict';

    var E = global.GameEngine;
    var IE = global.InventoryEquipment;

    var uiDeps = {};
    function setUiDeps(deps) {
        if (deps && typeof deps === 'object') uiDeps = Object.assign({}, uiDeps, deps);
    }
    function ui(key, vars) {
        return (typeof uiDeps.ui === 'function') ? uiDeps.ui(key, vars) : (key != null ? String(key) : '');
    }
    function getWorldTotalTicks() {
        return (typeof uiDeps.getWorldTotalTicks === 'function') ? uiDeps.getWorldTotalTicks() : 0;
    }

    // 敌人「本玩家动作内已反击」标记（transient）：attackEnemy 反击后置位，tick 钩子消费后清空。
    // 用途：AI 攻击去重——敌人每 tick（每玩家动作）恰好行动 1 次（反击计为该动作的攻击，AI 不再补刀）。
    var enemyCounterAttackFlags = {};

    /** 置位「本动作已反击」标记（由 scene-app 战斗动作侧在反击结算时调用）。 */
    function markCounterAttackFlag(key) {
        if (key) enemyCounterAttackFlags[key] = true;
    }

    /**
     * 敌人攻击玩家：构建「玩家受击」管线上下文（模块级，供反击与 AI 主动攻击共用）。
     * @param {object} rE resolveEnemyVsPlayerAttack 结果
     * @param {boolean} simDry 同速同时提交干跑
     * @param {object} opts { enemyId, facingDir, ex, ey, px, py }
     */
    function buildEnemyCounterAtkCtx(rE, simDry, opts) {
        opts = opts || {};
        var re = rE || {};
        var eid = opts.enemyId != null ? String(opts.enemyId) : '';
        var facing = opts.facingDir != null ? opts.facingDir : 4;
        return {
            eventIdSuffix: eid + '_' + String(re.moveId || 'counter') + (simDry ? '_sim' : ''),
            hitRollSuccess: !!re.hitRollSuccess,
            hitPart: re.hitPart || 'chest',
            moveId: re.moveId || 'enemy_counter_strike',
            skillId: re.skillId || '__enemy_counter_attack__',
            limbId: re.limbId || 'rhand',
            damageType: re.damageType || 'blunt',
            hitPartModifierKey: re.hitPartModifierKey || null,
            moveTags: [],
            subhit_index: 0,
            is_last_subhit: true,
            rawDamage: isFinite(re.rawDamage) ? re.rawDamage : 0,
            forceZeroDamageByResourceInsufficient: false,
            simultaneousDryRun: !!simDry,
            attacker: {
                kind: 'enemy',
                enemyId: eid,
                postEffectIds: [],
                facingDir: facing,
                pos: { x: opts.ex, y: opts.ey }
            },
            defender: {
                kind: 'player',
                facingDir: (global.PlayerFacing && typeof global.PlayerFacing.getDir === 'function') ? global.PlayerFacing.getDir() : 4,
                pos: { x: opts.px, y: opts.py }
            }
        };
    }

    /** 在当前地图 enemies[] 中按 enemy_id（可选坐标）定位实例下标；找不到返回 -1。 */
    function findEnemyInstanceIndex(enemyId, x, y) {
        try {
            var stNow = (E && typeof E.getState === 'function') ? E.getState() : null;
            var mapNow = (E && typeof E.getMap === 'function') ? E.getMap() : null;
            if (!stNow || !mapNow || !Array.isArray(mapNow.enemies)) return -1;
            for (var i = 0; i < mapNow.enemies.length; i++) {
                var rec = mapNow.enemies[i];
                if (!rec || rec.enemy_id !== enemyId) continue;
                if (x != null && y != null && (rec.x !== x || rec.y !== y)) continue;
                return i;
            }
        } catch (e) { /* ignore */ }
        return -1;
    }

    /** 敌人死亡落地：drain 死亡队列，从当前地图移除实例（坐标脏格重绘）+ 死亡日志。攻击结算后调用。 */
    function settleEnemyKills() {
        try {
            if (!window.CombatEnemies) return;
            // 1) 肢体失能日志（部位被打满瞬间，先于死亡输出）
            if (typeof window.CombatEnemies.drainEnemyLimbLossQueue === 'function') {
                var limbLoss = window.CombatEnemies.drainEnemyLimbLossQueue();
                var ll, lp;
                for (ll = 0; ll < limbLoss.length; ll++) {
                    var llName = limbLoss[ll].enemyId;
                    try {
                        if (window.UIText && typeof window.UIText.t === 'function') {
                            llName = window.UIText.t('enemy.name.' + String(limbLoss[ll].enemyId).replace(/\./g, '_'));
                        }
                    } catch (eL) { /* ignore */ }
                    for (lp = 0; lp < limbLoss[ll].parts.length; lp++) {
                        var partKey = limbLoss[ll].parts[lp];
                        var partName = ui('body.part.' + partKey);
                        var msgKey = (partKey === 'lfoot' || partKey === 'rfoot')
                            ? 'combat.log.enemy_limb_destroyed_leg'
                            : 'combat.log.enemy_limb_destroyed';
                        if (window.GameLog && typeof window.GameLog.log === 'function') {
                            window.GameLog.log(ui(msgKey, { enemyId: llName, part: partName }), 'system');
                        }
                    }
                }
            }
            // 2) 死亡落地：drain 死亡队列 → 移除地图实例 + 死亡日志 + 电池掉落（k89 运行时接线）
            if (typeof window.CombatEnemies.drainEnemyKillQueue !== 'function') return;
            var kills = window.CombatEnemies.drainEnemyKillQueue();
            if (!kills || !kills.length) return;
            var mapK = (E && typeof E.getMap === 'function') ? E.getMap() : null;
            var deadPos = []; // { enemyId, x, y } —— 移除前记录坐标，供掉落到尸体格
            if (mapK && Array.isArray(mapK.enemies)) {
                var deadIdx = [];
                var kd, di;
                for (kd = 0; kd < kills.length; kd++) {
                    if (String(mapK.map_id || '') !== String(kills[kd].mapId || '')) continue;
                    di = kills[kd].index;
                    if (di >= 0 && di < mapK.enemies.length && mapK.enemies[di] && mapK.enemies[di].enemy_id === kills[kd].enemyId) {
                        deadIdx.push(di);
                        deadPos.push({ enemyId: kills[kd].enemyId, x: mapK.enemies[di].x | 0, y: mapK.enemies[di].y | 0 });
                    }
                }
                deadIdx.sort(function (a, b) { return b - a; });
                for (var rm = 0; rm < deadIdx.length; rm++) {
                    var ri = deadIdx[rm];
                    var recGone = mapK.enemies[ri] || {};
                    if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                        window.SceneCtx.pushDirtyCell(recGone.x, recGone.y);
                    }
                    mapK.enemies.splice(ri, 1);
                }
            }
            settleEnemyBatteryDrops(kills, mapK, deadPos);
            var kl, kName;
            for (kl = 0; kl < kills.length; kl++) {
                kName = kills[kl].enemyId;
                try {
                    if (window.UIText && typeof window.UIText.t === 'function') {
                        kName = window.UIText.t('enemy.name.' + String(kills[kl].enemyId).replace(/\./g, '_'));
                    }
                } catch (eK) { /* ignore */ }
                if (window.GameLog && typeof window.GameLog.log === 'function') {
                    window.GameLog.log(ui('combat.log.enemy_killed', { enemyId: kName }), 'system');
                }
            }
        } catch (eKill) {
            if (window.console && typeof window.console.error === 'function') window.console.error('[enemy kill settle failed]', eKill);
        }
    }

    /**
     * 敌人电池掉落运行时（k89）：敌人死亡 → EnemyDrops.rollEnemyBatteryDrop →
     * 掉入背包（putItemIntoDefaultContainer，失败则掉到尸体格地面）。
     * floor/regionCode：优先取地图元数据（地牢生成器 k97/k101 会写 floor / region_code）；
     * 缺省回退 floor=1、regionCode=1（地表）。
     */
    function settleEnemyBatteryDrops(kills, mapK, deadPos) {
        try {
            if (!window.EnemyDrops || typeof window.EnemyDrops.rollEnemyBatteryDrop !== 'function') return;
            if (!IE || typeof IE.putItemIntoDefaultContainer !== 'function' || typeof IE.getItemTemplate !== 'function') return;
            if (!kills || !kills.length) return;
            var floor = 1, regionCode = 1;
            if (mapK && typeof mapK === 'object') {
                if (mapK.floor != null && isFinite(Number(mapK.floor))) floor = Math.max(1, Math.floor(Number(mapK.floor)));
                if (mapK.region_code != null && isFinite(Number(mapK.region_code))) regionCode = Math.floor(Number(mapK.region_code));
            }
            // items 映射：EnemyDrops 需要 region_restrict + battery_capacity 查模板
            var itemsMap = {};
            var allIds = (typeof IE.getAllItemIds === 'function') ? IE.getAllItemIds() : [];
            for (var ii = 0; ii < allIds.length; ii++) {
                var tplI = IE.getItemTemplate(allIds[ii]);
                if (tplI) itemsMap[allIds[ii]] = tplI;
            }
            for (var kl2 = 0; kl2 < kills.length; kl2++) {
                var drop = window.EnemyDrops.rollEnemyBatteryDrop({
                    enemyId: kills[kl2].enemyId,
                    floor: floor,
                    regionCode: regionCode,
                    items: itemsMap
                });
                if (!drop || !drop.item_id) continue;
                var inst = { item_id: drop.item_id, count: 1 };
                if (drop.battery_charge != null && isFinite(Number(drop.battery_charge))) inst.battery_charge = Math.max(0, Math.floor(Number(drop.battery_charge)));
                var placed = IE.putItemIntoDefaultContainer(inst);
                var dropName = String(drop.item_id);
                var dropTpl = IE.getItemTemplate(drop.item_id);
                if (dropTpl && dropTpl.name) dropName = dropTpl.name;
                var capTxt = '';
                var capV = dropTpl && dropTpl.battery_capacity != null ? Number(dropTpl.battery_capacity) : 0;
                if (capV > 0) capTxt = ui('combat.log.enemy_drop_battery_detail', { charge: String(inst.battery_charge != null ? inst.battery_charge : capV), cap: String(capV) });
                var dropEnemyName = String(kills[kl2].enemyId);
                try {
                    if (window.UIText && typeof window.UIText.t === 'function') {
                        dropEnemyName = window.UIText.t('enemy.name.' + String(kills[kl2].enemyId).replace(/\./g, '_'));
                    }
                } catch (eN) { /* ignore */ }
                if (!placed.placed) {
                    // 背包满 → 掉到尸体格
                    var gx = null, gy = null;
                    for (var dp = 0; dp < deadPos.length; dp++) {
                        if (String(deadPos[dp].enemyId) === String(kills[kl2].enemyId)) { gx = deadPos[dp].x; gy = deadPos[dp].y; break; }
                    }
                    if (gx == null && E && typeof E.getState === 'function') {
                        var stD = E.getState();
                        if (stD && stD.mapId != null && stD.x != null) { gx = stD.x; gy = stD.y; }
                    }
                    if (gx != null && typeof IE.addItemToGround === 'function') {
                        IE.addItemToGround(mapK ? mapK.map_id : null, gx, gy, inst);
                    }
                    if (window.GameLog && typeof window.GameLog.log === 'function') {
                        window.GameLog.log(ui('combat.log.enemy_drop_battery_ground', { enemyId: dropEnemyName, item: dropName, detail: capTxt }), 'system');
                    }
                } else if (window.GameLog && typeof window.GameLog.log === 'function') {
                    window.GameLog.log(ui('combat.log.enemy_drop_battery', { enemyId: dropEnemyName, item: dropName, detail: capTxt }), 'system');
                }
            }
        } catch (eDrop) {
            if (window.console && typeof window.console.error === 'function') window.console.error('[enemy battery drop failed]', eDrop);
        }
    }

    /** 计算「本动作已反击」标记键（mapId|i{index}），与 AI 去重口径一致；找不到实例返回 null。 */
    function enemyCounterAttackFlagKey(enemyId) {
        try {
            var stNow = (E && typeof E.getState === 'function') ? E.getState() : null;
            var mapNow = (E && typeof E.getMap === 'function') ? E.getMap() : null;
            if (!stNow || !mapNow || !Array.isArray(mapNow.enemies)) return null;
            for (var i = 0; i < mapNow.enemies.length; i++) {
                if (mapNow.enemies[i] && mapNow.enemies[i].enemy_id === enemyId) {
                    return String(mapNow.map_id || '') + '|i' + i;
                }
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    /**
     * 敌人 AI 落地（每 tick 一次）：移动敌人（改写 map.enemies 坐标 + 脏格重绘），并对贴脸敌人执行主动攻击（复用玩家受击管线）。
     * 决策逻辑见 CombatEnemies.updateEnemyAI（纯逻辑）；本函数只做场景落地。
     */
    function tickEnemiesAfterWorldTick() {
        if (!window.CombatEnemies || typeof window.CombatEnemies.updateEnemyAI !== 'function') return;
        var st = (E && typeof E.getState === 'function') ? E.getState() : null;
        if (!st) return;
        var map = (E && typeof E.getMap === 'function') ? E.getMap() : null;
        if (!map || !Array.isArray(map.enemies) || !map.enemies.length) return;
        var occ = {};
        var i, n;
        for (i = 0; i < map.enemies.length; i++) {
            n = map.enemies[i] || {};
            occ[String(n.x) + ',' + String(n.y)] = i;
        }
        var flags = enemyCounterAttackFlags;
        enemyCounterAttackFlags = {};
        var mapIdStr = String(map.map_id || '');
        var plan;
        try {
            plan = window.CombatEnemies.updateEnemyAI({
                map: map,
                playerX: st.x,
                playerY: st.y,
                tick: getWorldTotalTicks(),
                isWalkable: function (x, y) {
                    try { return E.isWalkable(x, y); } catch (e) { return false; }
                },
                isBlockedByOther: function (x, y, skipIdx) {
                    var k = String(x) + ',' + String(y);
                    if (occ[k] != null && occ[k] !== skipIdx) return true;
                    try {
                        if (E.getPortalAt && E.getPortalAt(x, y)) return true;
                        if (E.getInteractNpcIdAt && E.getInteractNpcIdAt(x, y)) return true;
                    } catch (e2) { /* ignore */ }
                    return false;
                },
                didActThisTick: function (index) {
                    return !!flags[mapIdStr + '|i' + (index | 0)];
                }
            });
        } catch (eAi) {
            return;
        }
        var m, mv, rec, atk;
        for (m = 0; m < plan.moves.length; m++) {
            mv = plan.moves[m];
            rec = map.enemies[mv.index];
            if (!rec) continue;
            rec.x = mv.toX;
            rec.y = mv.toY;
            if (window.CombatEnemies.setFacingDir && window.CombatEnemies.dirFromDelta) {
                var ddx = mv.toX - mv.fromX;
                var ddy = mv.toY - mv.fromY;
                window.CombatEnemies.setFacingDir(mv.enemyId, map.map_id, mv.toX, mv.toY, window.CombatEnemies.dirFromDelta(ddx, ddy));
            }
            if (window.SceneCtx && typeof window.SceneCtx.pushDirtyCell === 'function') {
                window.SceneCtx.pushDirtyCell(mv.fromX, mv.fromY);
                window.SceneCtx.pushDirtyCell(mv.toX, mv.toY);
            }
        }
        for (m = 0; m < plan.attacks.length; m++) {
            atk = plan.attacks[m];
            try { runEnemyAttackOnPlayer(atk.enemyId, atk.x, atk.y); }
            catch (eAtk) { if (window.console && typeof window.console.error === 'function') window.console.error('[AI attack failed]', atk, eAtk); }
        }
    }

    /** 敌人主动攻击玩家：走与还击相同的「玩家受击」管线（命中/招架/减伤）。 */
    function runEnemyAttackOnPlayer(enemyId, ex, ey) {
        var CMR = window.CombatMeleeResolve;
        var CP = window.CombatPipeline;
        if (!CMR || typeof CMR.resolveEnemyVsPlayerAttack !== 'function' || !CP || typeof CP.runPipeline !== 'function') return;
        var stP = (E && typeof E.getState === 'function') ? E.getState() : null;
        if (!stP) return;
        // 敌人眩晕（k13，37 §9.2）：眩晕中本 tick 无法行动 → 跳过本击
        if (window.CombatEnemies && typeof window.CombatEnemies.isEnemyStunned === 'function'
            && window.CombatEnemies.isEnemyStunned(stP.mapId, findEnemyInstanceIndex(enemyId, ex, ey))) return;
        var tpl = window.CombatEnemies && window.CombatEnemies.getById ? window.CombatEnemies.getById(enemyId) : null;
        var atkSpeed = tpl && tpl.speed != null ? Number(tpl.speed) : 10;
        if (!isFinite(atkSpeed) || atkSpeed < 1) atkSpeed = 10;
        var facingDir = 4;
        if (window.CombatEnemies && typeof window.CombatEnemies.ensureFacingTowardTarget === 'function') {
            facingDir = window.CombatEnemies.ensureFacingTowardTarget(enemyId, stP.mapId, ex, ey, stP.x, stP.y);
        }
        var rE = CMR.resolveEnemyVsPlayerAttack({
            enemyId: enemyId,
            attackerSpeed: atkSpeed,
            enemyMapId: stP.mapId != null ? stP.mapId : null,
            enemyIndex: findEnemyInstanceIndex(enemyId, ex, ey)
        });
        var atkCtx = buildEnemyCounterAtkCtx(rE, false, {
            enemyId: enemyId,
            facingDir: facingDir,
            ex: ex,
            ey: ey,
            px: stP.x,
            py: stP.y
        });
        CP.runPipeline('melee_hit_player_defender', atkCtx);
        if (window.GameLog && atkCtx.finalDamage != null && typeof window.GameLog.log === 'function') {
            try {
                window.GameLog.log(ui('log.combat.resolve.summary', {
                    dmg: String(Math.round(atkCtx.finalDamage)),
                    parry: atkCtx.parrySucceeded ? ui('log.combat.pipeline.parry_yes') : ui('log.combat.pipeline.parry_no')
                }) + ui('combat.log.enemy_attack'), 'damage');
            } catch (eLog) { /* ignore */ }
        }
    }

    /** 玩家眩晕衰减（37 §9.2，k13）：-1/tick（战斗外慢慢恢复；战斗内单击累积远大于衰减） */
    function tickPlayerStunDecay() {
        var IE2 = global.InventoryEquipment;
        if (!IE2 || typeof IE2.getPlayerStunValue !== 'function' || typeof IE2.setPlayerStunValue !== 'function') return;
        var cur = IE2.getPlayerStunValue();
        if (cur > 0) IE2.setPlayerStunValue(cur - 1);
    }

    global.CombatWorld = {
        setUiDeps: setUiDeps,
        markCounterAttackFlag: markCounterAttackFlag,
        buildEnemyCounterAtkCtx: buildEnemyCounterAtkCtx,
        findEnemyInstanceIndex: findEnemyInstanceIndex,
        settleEnemyKills: settleEnemyKills,
        settleEnemyBatteryDrops: settleEnemyBatteryDrops,
        enemyCounterAttackFlagKey: enemyCounterAttackFlagKey,
        tickEnemiesAfterWorldTick: tickEnemiesAfterWorldTick,
        runEnemyAttackOnPlayer: runEnemyAttackOnPlayer,
        tickPlayerStunDecay: tickPlayerStunDecay
    };
})(typeof window !== 'undefined' ? window : globalThis);
