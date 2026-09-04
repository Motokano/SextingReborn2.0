/**
 * 地牢掉落表 + 材料标签冒烟测试（k85，headless Node）。
 * 运行：node tools/test-dungeon-loot.mjs
 * 覆盖：
 *   1. 层数 → 档位映射（1-4/5-8/9-12/13-16，越界夹紧）
 *   2. getRows / roll 的平铺表与 {tiers} 结构
 *   3. 数据契约：loot_tables.json 每个 item_id 存在于 items.json，
 *      且 region_restrict 与所在地区一致（0=全局 或 == 地区码）
 *   4. 电池（battery_*）不进采集池（42 §一.5）
 *   5. region_restrict / dungeon_only / surface_only 标签分布
 */
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DungeonLoot = require('../js/dungeon-loot.js');

const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'));
const loot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'loot_tables.json'), 'utf8'));
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'));

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log('  ✓ ' + name);
}

console.log('== 1. 层数 → 档位 ==');
check('floor 1..4 → tier 0', () => {
    [1, 2, 3, 4].forEach((f) => assert.strictEqual(DungeonLoot.tierIndexForFloor(f), 0));
});
check('floor 5..8 → tier 1', () => {
    [5, 6, 7, 8].forEach((f) => assert.strictEqual(DungeonLoot.tierIndexForFloor(f), 1));
});
check('floor 9..12 → tier 2', () => {
    [9, 10, 11, 12].forEach((f) => assert.strictEqual(DungeonLoot.tierIndexForFloor(f), 2));
});
check('floor 13..16 → tier 3', () => {
    [13, 14, 15, 16].forEach((f) => assert.strictEqual(DungeonLoot.tierIndexForFloor(f), 3));
});
check('越界夹紧（0 与 17）', () => {
    assert.strictEqual(DungeonLoot.tierIndexForFloor(0), 0);
    assert.strictEqual(DungeonLoot.tierIndexForFloor(-3), 0);
    assert.strictEqual(DungeonLoot.tierIndexForFloor(17), 3);
    assert.strictEqual(DungeonLoot.tierIndexForFloor(99), 3);
});

console.log('== 2. 表结构（平铺 vs tiers） ==');
check('平铺表（loot_surface）任意层返回同一数组', () => {
    const rows1 = DungeonLoot.getRows(loot.loot_surface, 1);
    const rows7 = DungeonLoot.getRows(loot.loot_surface, 7);
    assert.ok(Array.isArray(rows1) && rows1.length > 40);
    assert.strictEqual(rows1, rows7);
});
check('新手地牢按层选档', () => {
    assert.strictEqual(DungeonLoot.getRows(loot.loot_beginner, 2).length, 11);
    assert.strictEqual(DungeonLoot.getRows(loot.loot_beginner, 6).length, 15);
    assert.strictEqual(DungeonLoot.getRows(loot.loot_beginner, 10).length, 15);
    assert.strictEqual(DungeonLoot.getRows(loot.loot_beginner, 15).length, 13);
});
check('roll 确定性（种子 rng）', () => {
    const seeded = (() => {
        let s = 42;
        return () => {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    })();
    const a = DungeonLoot.roll(loot.loot_d5, 3, seeded);
    const b = DungeonLoot.roll(loot.loot_d5, 3, seeded);
    assert.ok(typeof a === 'string' && a.length > 0);
    assert.notStrictEqual(a, b, '两次抽取应不同（权重池>1）');
});
check('空表/非法表 → null', () => {
    assert.strictEqual(DungeonLoot.roll(null, 1), null);
    assert.strictEqual(DungeonLoot.getRows({ tiers: [[], [], [], []] }, 1).length, 0);
    assert.strictEqual(DungeonLoot.getRows({ foo: 1 }, 1), null);
});

console.log('== 3. 数据契约：loot_table 行全部存在且地区一致 ==');
const regionByTable = {};
const regionGateByTable = {};
Object.keys(regions.regions).forEach((key) => {
    regionByTable[regions.regions[key].loot_table] = regions.regions[key].code;
    regionGateByTable[regions.regions[key].loot_table] = regions.regions[key].region_gated !== false;
});
const surfaceIds = new Set((loot.loot_surface || []).map((r) => r.item_id));
let rowCount = 0;
let batteryLeak = [];
for (const tableName of Object.keys(loot)) {
    if (!Object.prototype.hasOwnProperty.call(regionByTable, tableName)) continue; // loot_bush/loot_grass 等旧表跳过
    const table = loot[tableName];
    const code = regionByTable[tableName];
    const gated = regionGateByTable[tableName];
    const lists = Array.isArray(table) ? [table] : table.tiers;
    lists.forEach((rows, ti) => {
        rows.forEach((r) => {
            rowCount++;
            assert.ok(items[r.item_id], `${tableName} 引用不存在的 item_id: ${r.item_id}`);
            assert.ok(Number(r.weight) > 0, `${tableName} 权重必须 >0: ${r.item_id}`);
            const item = items[r.item_id];
            const rr = item.region_restrict == null ? 0 : Number(item.region_restrict);
            if (gated) {
                // 主题地牢：行内物品必须 region 兼容（0=全局 或 == 地区码）
                assert.ok(rr === 0 || rr === code, `${r.item_id} region_restrict=${rr} 与 ${tableName}(地区码 ${code}) 不一致`);
            } else {
                // 新手地牢（42 §二.3）：地表池高品质来源——行必须来自地表池（或地区码 2 专属件）
                assert.ok(surfaceIds.has(r.item_id) || rr === 0 || rr === code,
                    `${tableName} 行 ${r.item_id} 不属于地表池且地区不兼容`);
            }
            if (String(r.item_id).indexOf('battery_') === 0) batteryLeak.push(tableName + ':' + r.item_id);
        });
    });
}
check('9 张地区表全部有行且行数>0，region_gated 标记齐全', () => {
    assert.ok(rowCount > 200);
    const gates = Object.keys(regions.regions).map((k) => regions.regions[k].region_gated);
    assert.ok(gates.every((g) => typeof g === 'boolean'), 'regions.json 每个地区必须有 region_gated 布尔');
    console.log(`      （地区表共 ${rowCount} 行）`);
});
check('电池不进采集池', () => {
    assert.strictEqual(batteryLeak.length, 0, '电池不应出现在 loot_table：' + batteryLeak.join(', '));
});

console.log('== 4. 材料标签与地区码分布 ==');
const itemList = Object.values(items);
const tagCount = (t) => itemList.filter((i) => DungeonLoot.hasTag(i, t)).length;
check('dungeon_only / surface_only 标签存在且不重叠', () => {
    const d = tagCount('dungeon_only');
    const s = tagCount('surface_only');
    assert.ok(d > 50, 'dungeon_only 应 >50，实际 ' + d);
    assert.ok(s >= 48, 'surface_only 应 >=48，实际 ' + s);
    const both = itemList.filter((i) => DungeonLoot.hasTag(i, 'dungeon_only') && DungeonLoot.hasTag(i, 'surface_only'));
    assert.strictEqual(both.length, 0, '不应同时带两个标签');
});
check('regions.json 地区码唯一且 loot_table 引用存在', () => {
    const codes = Object.values(regions.regions).map((r) => r.code);
    assert.strictEqual(new Set(codes).size, codes.length);
    Object.values(regions.regions).forEach((r) => {
        assert.ok(loot[r.loot_table], '缺表 ' + r.loot_table);
    });
});
check('dungeon_only 物品的 region_restrict 都指向地牢或 0（无地表码）', () => {
    const surfaceCode = regions.regions.surface.code;
    const bad = itemList.filter((i) => DungeonLoot.hasTag(i, 'dungeon_only') && Number(i.region_restrict) === surfaceCode);
    assert.strictEqual(bad.length, 0, bad.map((i) => i.item_id).join(','));
});

console.log(`\n全部通过（${passed} 组断言）`);
