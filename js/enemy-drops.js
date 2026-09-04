/**
 * 敌人电池掉落（k89，接 42 §四 / regions.json battery 注释）：
 * - 数据：data/enemy_drops.json —— battery_tiers（按层数档位，与 dungeon-loot tierIndexForFloor 对齐：
 *   1-4 主题基础款 / 5-8 进阶 / 9-12 稀有 / 13-16 独有）。
 * - 语义：浅层小兵掉五号/干电池（一次性），越深掉率越高、容量越大（深层稀有蓄电池）。
 * - 门控：行内物品 region_restrict（0=全局 / 8=D6 / 9=D7）按所在地区过滤——D6 敌人不掉蓄电池，
 *   D7 不掉充电电池（42 §三 D6/D7 分工）；enemies 表可按敌人类型调 chance_mult（地表小兵降权）。
 * - 电量 roll：掉落电池的电量 = 容量 × [charge_roll.min_pct, max_pct] 随机（拾荒/偷电半电 lore）。
 * - 运行时接线（敌人死亡 → 按本表结算掉落入包）为 k169 范围；本模块仅提供纯逻辑（可单测）。
 */
(function (global) {
    'use strict';

    var config = { battery_tiers: [], charge_roll: { min_pct: 30, max_pct: 100 }, enemies: {} };

    function setConfig(json) {
        config = { battery_tiers: [], charge_roll: { min_pct: 30, max_pct: 100 }, enemies: {} };
        if (!json || typeof json !== 'object') return;
        if (Array.isArray(json.battery_tiers)) config.battery_tiers = json.battery_tiers;
        if (json.charge_roll && typeof json.charge_roll === 'object') {
            var cmin = Number(json.charge_roll.min_pct);
            var cmax = Number(json.charge_roll.max_pct);
            if (isFinite(cmin) && isFinite(cmax)) config.charge_roll = { min_pct: Math.max(0, Math.min(100, cmin)), max_pct: Math.max(0, Math.min(100, cmax)) };
        }
        if (json.enemies && typeof json.enemies === 'object') config.enemies = json.enemies;
    }

    /** 层数 → 档位（复用 dungeon-loot 语义；独立实现便于 Node 单测，无依赖）。 */
    function tierIndexForFloor(floor) {
        var f = Number(floor);
        if (!isFinite(f) || f < 1) return 0;
        if (f > 16) return 3;
        return Math.min(3, Math.floor((f - 1) / 4));
    }

    function getTierRows(tierIndex) {
        var t = Math.max(0, Math.min(3, tierIndex | 0));
        var tier = config.battery_tiers[t];
        return tier && Array.isArray(tier.pool) ? tier : null;
    }

    function enemyChanceMult(enemyId) {
        var e = config.enemies && config.enemies[String(enemyId || '')];
        if (!e || typeof e !== 'object') return 1;
        var m = Number(e.chance_mult);
        return isFinite(m) && m > 0 ? m : 1;
    }

    /** 地区门控：region_restrict 缺省/0 = 全局；非 0 必须等于地区码。 */
    function isRegionAllowed(item, regionCode) {
        var rr = item && item.region_restrict != null ? Number(item.region_restrict) : 0;
        if (!rr) return true;
        if (regionCode == null) return false; // 无地区上下文时不掉非全局电池（保守）
        return rr === Number(regionCode);
    }

    function filterRowsByRegion(rows, regionCode, items) {
        if (!rows) return rows;
        return rows.filter(function (r) {
            if (!r || !r.item_id) return false;
            var item = items && items[r.item_id] ? items[r.item_id] : null;
            return isRegionAllowed(item, regionCode);
        });
    }

    function pickWeighted(rows, rng) {
        if (!rows || !rows.length) return null;
        var total = 0;
        for (var i = 0; i < rows.length; i++) {
            var w = Number(rows[i].weight);
            total += isFinite(w) && w > 0 ? w : 0;
        }
        if (total <= 0) return null;
        var rand = typeof rng === 'function' ? rng() : Math.random();
        var cursor = rand * total;
        for (var j = 0; j < rows.length; j++) {
            var wj = Number(rows[j].weight);
            if (isFinite(wj) && wj > 0) {
                cursor -= wj;
                if (cursor <= 0) return rows[j];
            }
        }
        return rows[rows.length - 1];
    }

    /** 电量 roll：返回 [min_pct, max_pct]% × 容量，向下取整；容量缺失/非法返回 null。 */
    function rollCharge(item, rng) {
        var cap = item && item.battery_capacity != null ? Math.floor(Number(item.battery_capacity)) : 0;
        if (!isFinite(cap) || cap <= 0) return null;
        var minPct = Number(config.charge_roll.min_pct);
        var maxPct = Number(config.charge_roll.max_pct);
        if (!isFinite(minPct) || !isFinite(maxPct)) { minPct = 30; maxPct = 100; }
        if (maxPct < minPct) maxPct = minPct;
        var rand = typeof rng === 'function' ? rng() : Math.random();
        var pct = minPct + (maxPct - minPct) * rand;
        return Math.max(0, Math.min(cap, Math.floor(cap * pct / 100)));
    }

    /**
     * 敌人电池掉落结算（纯逻辑，k169 在敌人死亡时调用）：
     * - 按层数档位选 battery_tiers 行；无档位/空池 → null。
     * - 掉率 = tier.chance × enemy.chance_mult（夹紧到 [0,1]）。
     * - 地区过滤（D6/D7 分工）后按权重抽一项 → 电量 roll。
     * @param {object} o { enemyId, floor, regionCode, items, rng? }
     * @returns {{ item_id: string, battery_charge: number } | null}
     */
    function rollEnemyBatteryDrop(o) {
        if (!o || typeof o !== 'object') return null;
        var tier = getTierRows(tierIndexForFloor(o.floor));
        if (!tier) return null;
        var chance = Math.min(1, Math.max(0, (Number(tier.chance) || 0) * enemyChanceMult(o.enemyId)));
        var rand = typeof o.rng === 'function' ? o.rng() : Math.random();
        if (rand >= chance) return null;
        var items = o.items && typeof o.items === 'object' ? o.items : {};
        var pool = filterRowsByRegion(tier.pool, o.regionCode, items);
        var row = pickWeighted(pool, o.rng);
        if (!row || !row.item_id) return null;
        var charge = rollCharge(items[row.item_id], o.rng);
        if (charge == null) return null;
        return { item_id: row.item_id, battery_charge: charge };
    }

    var api = {
        setConfig: setConfig,
        tierIndexForFloor: tierIndexForFloor,
        getTierRows: getTierRows,
        enemyChanceMult: enemyChanceMult,
        isRegionAllowed: isRegionAllowed,
        filterRowsByRegion: filterRowsByRegion,
        pickWeighted: pickWeighted,
        rollCharge: rollCharge,
        rollEnemyBatteryDrop: rollEnemyBatteryDrop
    };

    global.EnemyDrops = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
