/**
 * 地牢掉落表选择与权重结算（k85，接 42 §七 / 44 §三）：
 * - 地区编码约定见 data/regions.json：region_restrict 0 = 全局，非 0 = 限定地区。
 * - 层数档位：tierIndex = clamp(floor-1)/4（1-4 → 0 主题基础款 / 5-8 → 1 进阶 / 9-12 → 2 稀有 / 13-16 → 3 独有）。
 * - loot_table 结构：地牢/新手地牢为 { tiers: [ [ {item_id, weight}, ... ] ×4 ] }；地表为平铺数组。
 * - 行仅 item_id + weight（无品质档，41：稀有度 = 物品身份）。
 * - 电池（battery_*）不进采集池（42 §一.5），由敌人掉落（k89）另表处理。
 * - region_gated（regions.json）：新手地牢 = 地表池高品质来源（42 §二.3），表内行显式枚举地表材料，
 *   生成器对其不做 region_restrict 过滤（表即门控）；七座主题地牢与地表为 region_gated=true。
 *
 * 本模块是「按层数选表」的**唯一事实源**：k97 地牢生成器必须经 getRows / tierIndexForFloor
 * 选表；测试 tools/test-dungeon-loot.mjs 用同一套逻辑校验数据。
 */
(function (global) {
    'use strict';

    var TIER_COUNT = 4;
    var FLOORS_PER_TIER = 4;
    var MAX_FLOOR = TIER_COUNT * FLOORS_PER_TIER; // 16

    /** 层数 → 档位下标（0..3），越界自动夹紧（≤0 层视为 0 档，>16 层视为 3 档）。 */
    function tierIndexForFloor(floor) {
        var f = Number(floor);
        if (!isFinite(f)) return 0;
        if (f < 1) return 0;
        if (f > MAX_FLOOR) return TIER_COUNT - 1;
        return Math.min(TIER_COUNT - 1, Math.floor((f - 1) / FLOORS_PER_TIER));
    }

    /**
     * 取 loot_table 当前层应使用的掉落行数组（每行 { item_id, weight }）。
     * - 平铺数组（地表 / 兼容旧表如 loot_bush）直接返回；
     * - { tiers: [...] } 结构按层数选档；缺档/缺表返回 null。
     */
    function getRows(lootTable, floor) {
        if (!lootTable) return null;
        if (Array.isArray(lootTable)) return lootTable;
        if (lootTable && Array.isArray(lootTable.tiers)) {
            var t = tierIndexForFloor(floor);
            var rows = lootTable.tiers[t];
            return Array.isArray(rows) ? rows : null;
        }
        return null;
    }

    /** 按权重抽一行，返回 { item_id, weight }；空表返回 null。 */
    function pickRow(rows, rng) {
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

    /** 抽 item_id；表为空/权重非法返回 null。 */
    function roll(lootTable, floor, rng) {
        var row = pickRow(getRows(lootTable, floor), rng);
        return row ? row.item_id : null;
    }

    /** 物品是否允许在指定地区生成（region_restrict 缺省视为 0 = 全局）。 */
    function isRegionAllowed(item, regionCode) {
        var rr = item && item.region_restrict != null ? Number(item.region_restrict) : 0;
        if (!rr) return true;
        return rr === Number(regionCode);
    }

    /** 按地区码过滤掉落行（双重门控：loot_table 成员 + region_restrict）。 */
    function filterRowsByRegion(rows, regionCode, items) {
        if (!rows) return rows;
        return rows.filter(function (r) {
            if (!r || !r.item_id) return false;
            var item = items && items[r.item_id] ? items[r.item_id] : null;
            return isRegionAllowed(item, regionCode);
        });
    }

    /** 物品是否带某标签（tags 为分号分隔字符串）。 */
    function hasTag(item, tag) {
        if (!item || !item.tags) return false;
        return String(item.tags).split(';').indexOf(String(tag)) !== -1;
    }

    var api = {
        TIER_COUNT: TIER_COUNT,
        FLOORS_PER_TIER: FLOORS_PER_TIER,
        MAX_FLOOR: MAX_FLOOR,
        tierIndexForFloor: tierIndexForFloor,
        getRows: getRows,
        pickRow: pickRow,
        roll: roll,
        isRegionAllowed: isRegionAllowed,
        filterRowsByRegion: filterRowsByRegion,
        hasTag: hasTag
    };

    // 浏览器挂全局
    global.DungeonLoot = api;
    // Node/ESM 可导入（测试脚本用）
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
