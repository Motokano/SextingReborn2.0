/**
 * 敌人电池掉落冒烟测试（k89，headless Node）。
 * 运行：node tools/test-enemy-drops.mjs
 * 覆盖：
 *   1. 电池物品数据契约：battery_aa/rechargeable/storage 存在，battery_capacity > 0、
 *      battery_charge ∈ [0, capacity]；标签 dungeon_only、地区码 0/8/9
 *   2. enemy_drops.json 结构：4 档、chance ∈ (0,1]、行 id 存在、权重 > 0
 *   3. 层数→档位映射（浅层五号 / 深层蓄电池）
 *   4. rollEnemyBatteryDrop：确定性 rng、掉率上限、地区过滤（D6/D7 分工）、
 *      电量 ∈ [30%,100%]×容量、charge_mult 生效、无电池行 → null
 */
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EnemyDrops = require('../js/enemy-drops.js');

const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'items.json'), 'utf8'));
const drops = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'enemy_drops.json'), 'utf8'));
EnemyDrops.setConfig(drops);

let passed = 0;
function check(name, fn) {
    fn();
    passed++;
    console.log('  ✓ ' + name);
}

function seeded(seed) {
    let s = seed;
    return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

console.log('== 1. 电池物品数据契约 ==');
check('三种电池存在且容量/电量合法', () => {
    for (const id of ['battery_aa', 'battery_rechargeable', 'battery_storage']) {
        const it = items[id];
        assert.ok(it, id + ' 缺失');
        assert.ok(Number(it.battery_capacity) > 0, id + ' battery_capacity 应 > 0');
        assert.ok(Number(it.battery_charge) >= 0 && Number(it.battery_charge) <= Number(it.battery_capacity),
            id + ' battery_charge 应在 [0, capacity]');
        assert.ok(EnemyDrops.isRegionAllowed(it, it.region_restrict), id + ' 地区自洽');
    }
});
check('容量随档位递增（五号 < 充电 < 蓄电）', () => {
    const cap = (id) => Number(items[id].battery_capacity);
    assert.ok(cap('battery_aa') < cap('battery_rechargeable'));
    assert.ok(cap('battery_rechargeable') < cap('battery_storage'));
});
check('全部电池不进采集池（loot_tables 无 battery_*）', () => {
    const loot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'loot_tables.json'), 'utf8'));
    const leak = [];
    (function walk(o) {
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (o && typeof o === 'object') {
            if (typeof o.item_id === 'string' && String(o.item_id).indexOf('battery_') === 0) leak.push(o.item_id);
            Object.keys(o).forEach((k) => walk(o[k]));
        }
    })(loot);
    assert.strictEqual(leak.length, 0, 'loot_tables 不应含电池：' + leak.join(', '));
});

console.log('== 2. enemy_drops.json 结构 ==');
check('battery_tiers 共 4 档且每档池有效', () => {
    assert.strictEqual(drops.battery_tiers.length, 4);
    drops.battery_tiers.forEach((t, ti) => {
        assert.strictEqual(t.tier, ti);
        assert.ok(Number(t.chance) > 0 && Number(t.chance) <= 1, 'tier ' + ti + ' chance 应在 (0,1]');
        assert.ok(Array.isArray(t.pool) && t.pool.length > 0, 'tier ' + ti + ' pool 非空');
        t.pool.forEach((r) => {
            assert.ok(items[r.item_id], 'tier ' + ti + ' 引用不存在物品: ' + r.item_id);
            assert.ok(Number(r.weight) > 0, 'tier ' + ti + ' 权重必须 >0');
        });
    });
});
check('浅层（档 0）只出五号电池；深层（档 3）出充电/蓄电', () => {
    const t0 = drops.battery_tiers[0].pool.map((r) => r.item_id);
    const t3 = drops.battery_tiers[3].pool.map((r) => r.item_id);
    assert.deepStrictEqual(t0.sort(), ['battery_aa']);
    assert.ok(t3.indexOf('battery_rechargeable') >= 0 && t3.indexOf('battery_storage') >= 0);
});
check('charge_roll 合法', () => {
    assert.ok(Number(drops.charge_roll.min_pct) >= 0 && Number(drops.charge_roll.min_pct) <= Number(drops.charge_roll.max_pct) && Number(drops.charge_roll.max_pct) <= 100);
});

console.log('== 3. 层数→档位 ==');
check('tierIndexForFloor 对齐 dungeon-loot', () => {
    const DungeonLoot = require('../js/dungeon-loot.js');
    for (let f = 0; f <= 20; f++) {
        assert.strictEqual(EnemyDrops.tierIndexForFloor(f), DungeonLoot.tierIndexForFloor(f), 'floor ' + f);
    }
});

console.log('== 4. rollEnemyBatteryDrop ==');
check('确定性 rng：同种子同结果', () => {
    const a = EnemyDrops.rollEnemyBatteryDrop({ enemyId: 'enemy.street_thug', floor: 2, regionCode: 1, items: items, rng: seeded(7) });
    const b = EnemyDrops.rollEnemyBatteryDrop({ enemyId: 'enemy.street_thug', floor: 2, regionCode: 1, items: items, rng: seeded(7) });
    assert.deepStrictEqual(a, b);
});
check('浅层 1-4 层只可能掉五号电池', () => {
    for (let i = 0; i < 200; i++) {
        const r = EnemyDrops.rollEnemyBatteryDrop({ enemyId: 'enemy.x', floor: 3, regionCode: 2, items: items, rng: seeded(1000 + i) });
        if (r) assert.strictEqual(r.item_id, 'battery_aa');
    }
});
check('深层 D7（地区 9）掉蓄电池；D6（地区 8）不掉蓄电池', () => {
    let sawStorageD7 = false;
    for (let i = 0; i < 400; i++) {
        const r7 = EnemyDrops.rollEnemyBatteryDrop({ enemyId: 'enemy.d7', floor: 15, regionCode: 9, items: items, rng: seeded(2000 + i) });
        if (r7) {
            assert.notStrictEqual(r7.item_id, 'battery_rechargeable', 'D7 不应掉充电电池（地区门控）');
            if (r7.item_id === 'battery_storage') sawStorageD7 = true;
        }
        const r6 = EnemyDrops.rollEnemyBatteryDrop({ enemyId: 'enemy.d6', floor: 15, regionCode: 8, items: items, rng: seeded(3000 + i) });
        if (r6) assert.notStrictEqual(r6.item_id, 'battery_storage', 'D6 不应掉蓄电池（地区门控）');
    }
    assert.ok(sawStorageD7, 'D7 深层应能掉出蓄电池');
});
check('电量 roll ∈ [30%,100%]×容量', () => {
    for (const id of ['battery_aa', 'battery_rechargeable', 'battery_storage']) {
        for (let i = 0; i < 100; i++) {
            const c = EnemyDrops.rollCharge(items[id], seeded(4000 + i));
            const cap = Number(items[id].battery_capacity);
            assert.ok(c >= Math.floor(cap * 0.3) && c <= cap, id + ' charge=' + c + ' cap=' + cap);
        }
    }
});
check('enemy 表 chance_mult 生效（街痞降权）', () => {
    const plainChance = () => {
        let hit = 0;
        for (let i = 0; i < 2000; i++) if (EnemyDrops.rollEnemyBatteryDrop({ enemyId: 'enemy.generic', floor: 1, regionCode: 2, items: items, rng: seeded(5000 + i) })) hit++;
        return hit / 2000;
    };
    const thugChance = () => {
        let hit = 0;
        for (let i = 0; i < 2000; i++) if (EnemyDrops.rollEnemyBatteryDrop({ enemyId: 'enemy.street_thug', floor: 1, regionCode: 1, items: items, rng: seeded(6000 + i) })) hit++;
        return hit / 2000;
    };
    const pc = plainChance(), tc = thugChance();
    assert.ok(pc > tc, '街痞掉率应低于通用敌人（0.25×0.8 vs 0.25），实际 ' + pc.toFixed(3) + ' vs ' + tc.toFixed(3));
    assert.ok(pc > 0.2 && pc < 0.3, '通用浅层掉率应约 0.25，实际 ' + pc.toFixed(3));
});
check('无配置/无档位 → 安全兜底', () => {
    assert.strictEqual(EnemyDrops.rollEnemyBatteryDrop(null), null);
    assert.strictEqual(EnemyDrops.rollEnemyBatteryDrop({}), null);
    assert.strictEqual(EnemyDrops.rollEnemyBatteryDrop({ enemyId: 'enemy.x', floor: 99, regionCode: 1, items: items, rng: seeded(1) }), null);
});

console.log(`\n全部通过（${passed} 组断言）`);
