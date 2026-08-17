# 畜牧系统可扩展性架构（实现约定）

本文档定义畜牧系统落地时的**数据驱动与接口架构**，目标是：**新增动物种类、模块种类、Perk 种类、产出，主要通过「加配置」完成；仅全新结算机制才需要「注册一个 handler」**。设计正本与数值见 [`31-livestock-husbandry.md`](31-livestock-husbandry.md)，本文只约定「怎么落地、怎么扩展」。

---

## 1. 原则（沿用仓库既有模式）

畜牧系统**不另起炉灶**，复用项目已验证的扩展模式：

| 模式 | 参照 | 畜牧对应 |
|------|------|---------|
| 数据驱动 JSON 分表 | `/data/` 各表 | `livestock-species.json` / `livestock-modules.json` / `livestock-perks.json` |
| 注册表 + handler 覆盖 | `combat-pipeline.js` 的 `registerPhaseHandler` | `LivestockRegistry.registerEffectHandler` |
| 文案解耦 | `UIText.t(key)` | 所有物种/模块/Perk 显示名走 key |
| 事件驱动 | `hit_roll_success` 等 | 生态结算 / 繁殖 / 捕获 / 屠宰发事件 |
| per-接口修正 | `31` §13.5 | 物种/Perk/模块/事件通过统一 modifier 修正数值 |

**硬约束**：
- 核心结算代码（生态 tick、饥饿、成长、繁殖、屠宰、Perk 遗传）**不得**出现 `if (species_id === 'cattle')` 之类的物种硬编码；所有物种差异来自配置表。
- 模块/Perk 效果**不得**用 `switch(module_id)` 硬编码分发；用声明式 `effect_type + params` + 注册 handler。

---

## 2. 配置表

### 2.1 物种表 `data/livestock-species.json`

一条物种 = 一个完整的数据化「动物模板」。字段对应 `31` 文档各章（§3 体重/§4 饥饿/§5 生态/§6 产出/§7 繁殖/§8 Perk 池/§10 饲料）。新增动物 = 复制一份改数值。

```jsonc
{
  "schema_version": 1,
  "species": {
    "cattle": {
      "species_id": "cattle",
      "name_key": "livestock.species.cattle",     // UIText key

      // §3 体重三段 + 成熟
      "growth": {
        "birth_weight_kg": 4.5,
        "graze_cap_kg": 150,          // 无草饲阶段的动物填 null（猪/鸡）
        "wean_weight_kg": null,        // 猪=30（离乳=幼→成年分界）
        "fatten_cap_kg": 600,
        "maturity_ticks": 10000,       // 幼体→成年
        "graze_satiety_threshold": { "grow": 70, "stall": 30 }, // §3.4 三段式
        "graze_growth_rate_kg_per_tick": 0.01455
      },

      // §4 饥饿
      "satiety": {
        "drain_per_tick": 0.0222,      // = 100 ÷ 饿死时间（§4.2）
        "starvation": { "to_zero_ticks": 4500, "dying_countdown_ticks": 1500 }
      },

      // §5.1 吃草；猪/鸡不吃草 → null
      "graze": {
        "edible_min_m": 0.4, "edible_max_m": null,   // 开区间
        "comfort_min_m": 0.6, "comfort_max_m": null,
        "comfort_rate_m_per_tick": 0.0005,
        "non_comfort_mult": 0.8,
        "satiety_regen_per_tick": 0.05
      },

      // §10 饲料；猪/鸡不吃草但吃饲料，此处照填
      "feed": {
        "nutrition_per_kg_meat": 80,      // §10.1 每 kg 肉所需营养
        "feed_units_per_tick": 0.72,      // §10.5 长肉速率口径
        "feed_replenishes_satiety": false, // 仅猪 true；1 unit = 10 饱腹
        "feed_units_per_satiety": null
      },

      // §7 繁殖；鸡不繁殖 → null
      "reproduction": {
        "pregnancy_ticks": 5000,
        "postpartum_cooldown_ticks": 5000,
        "litter_size": [1, 1],            // [min, max]
        "base_pregnancy_rate_per_tick": 0.0002  // = 1/怀孕期
      },

      // §4.4 自然寿命；null = 不限
      "lifespan_ticks": null,

      // §5 生态影响（每只/tick，作用于所在区）
      "ecosystem_impact": {
        "trample_per_tick": 0.045,        // 板结度 +（牛/羊）
        "pollution_per_tick": 0,          // 污染 +%（羊）
        "root_clean_per_tick": 0          // 板结 −（猪）/ 降污 −%（猪）
      },

      // §6 产出契约（引用 §6.4 的 item_id）
      "products": {
        "living": [
          { "product_id": "milk", "item_id": "hus_milk_buffalo", "cooldown_ticks": 432 },
          { "product_id": "blood", "item_id": "hus_beef_blood", "cooldown_ticks": 1008, "hp_cost": 10, "min_hp": 50 }
        ],
        "slaughter": { "meat_item_ids": ["hus_beef_steak"], "offal_item_ids": ["hus_beef_heart", "..."], "byproduct_item_ids": ["hus_beef_hide", "hus_beef_bone", "..."] }
      },

      // §8 Perk 池（引用 perks.json 的 perk_id）
      "perk_pool": ["big_eater", "light_eater", "fast_growth", "slow_growth", "easy_fat", "hard_gainer", "hardy", "frail", "fertile", "barren", "high_yield", "low_yield", "meaty", "lean", "heavy_hoof", "light_hoof", "fast_graze", "picky_eater", "earth_cry", "pheromone", "parthenogenesis", "chain_pregnancy", "hermaphrodite", "eternal_spring"]
    }
  }
}
```

**要点**：
- 物种差异全部落在此表；`31` 里所有「按物种分」的数值表（§3.4/§4.2/§4.4/§5.1/§5.2/§6.1/§7.2/§10.5）都应能从此表重建。
- `graze` / `reproduction` 可整块为 `null`，结算器据此跳过对应阶段（鸡无草饲、无繁殖）。

### 2.2 模块表 `data/livestock-modules.json`

一条模块 = 占面 + 体量 + Lv1-5 声明式效果。

```jsonc
{
  "schema_version": 1,
  "modules": {
    "feed_trough": {
      "module_id": "feed_trough",
      "name_key": "livestock.module.feed_trough",
      "tier": "small",                    // small | medium | large | axis
      "slots": { "side": 1 },             // 占面（内部/前端/底面/上表面/侧面/轴心）
      "axis_slot": null,                  // axis 模块：1 | 2
      "upgrade_material_tier": "small",   // §11.2 升级材料模板档位
      "levels": [
        { "level": 1, "effects": [
          { "effect_type": "feed_trough", "params": { "capacity_units": 100 } }
        ]},
        { "level": 2, "effects": [] }
      ]
    },
    "clinic_arm": {
      "module_id": "clinic_arm",
      "tier": "large",
      "slots": { "inner": 1, "front": 1, "side": 2 },
      "levels": [
        { "level": 1, "effects": [
          { "effect_type": "heal", "params": { "hp_per_tick": 0.01, "simultaneous": 2 } }
        ]},
        { "level": 3, "effects": [
          { "effect_type": "heal", "params": { "hp_per_tick": 0.03, "simultaneous": 4 } },
          { "effect_type": "pause_disease_spread", "params": {} }
        ]}
      ]
    }
  }
}
```

**要点**：
- 每个 `level` 的 `effects[]` 是**声明式**的：运行时 `registerEffectHandler(effect_type, fn)` 解释，`params` 是纯数据。
- 新增模块 = 加一条配置 + 组合现有 `effect_type`；**只有全新机制**才需要 `registerEffectHandler` 注册新 handler。
- 内置 `effect_type` 目录（首版）：`feed_trough`、`feed_preprocess`、`slaughter`、`coop`（鸡笼）、`sprinkler`、`clean_brush`、`auto_collect`、`tiller`、`seeder`、`manure_net`、`pasture_arm`、`heal`、`pause_disease_spread`、`feed_refine`、`link_schedule`、`waste_heat_recycle`、`warehouse_hub`、`climate_control`、`collect_corpse`、`forward_corpse`。此目录可增。

### 2.3 Perk 表 `data/livestock-perks.json`

一条 Perk = 稀有度 + 物种 + 条件 + 修正。

```jsonc
{
  "schema_version": 1,
  "perks": {
    "big_eater": {
      "perk_id": "big_eater",
      "name_key": "livestock.perk.big_eater",
      "rarity": "common",                 // common | uncommon | rare | very_rare
      "species": ["cattle", "sheep", "pig"],
      "requires": null,                   // 或 { "gender": "female" }
      "modifiers": { "satiety_drain_mult": 1.2 }
    },
    "high_yield": {
      "perk_id": "high_yield",
      "rarity": "rare",
      "species": ["cattle", "sheep"],
      "requires": { "gender": "female" },
      "modifiers": { "product_cooldown_mult_milk": 0.7, "product_cooldown_mult_wool": 0.7 }
    },
    "crossbreed_swine": {
      "perk_id": "crossbreed_swine",
      "rarity": "very_rare",
      "species": ["pig"],
      "requires": { "gender": "male" },
      "mechanic": "crossbreed_swine",      // 机制性 Perk：注册专属 handler，而非纯 modifiers
      "params": { "trigger_chance": 0.15, "cooldown_ticks": 10000 }
    }
  }
}
```

**要点**：
- 数值型 Perk 用 `modifiers`（key 目录见 §5），结算器按 key 统一应用——新增纯数值 Perk 只需复用现有 key。
- 机制型 Perk（very_rare 那 8 个，见 `31` §8.4）用 `mechanic` + 注册 handler，是少数需要代码的场景。
- 跨种 Perk 规则（`31` §8.5「不生效但可遗传」）由结算器统一处理：`species` 与携带者不符 → 不生效但保留。

### 2.4 产出契约

产出 item_id 映射已在 [`31` §6.4](31-livestock-husbandry.md) 建好。物种表 `products` 直接引用这些 item_id。新增产出 = 先加 item 到 `items.json`（§6.4「新增」项），再在物种表引用。

---

## 3. 动物实例模型（存档）

动物在存档中存「实例」，`species_id` 指向静态模板，动态状态在实例上：

```jsonc
{
  "uid": "animal_0001",           // 全局唯一，跨区迁移/遗传/尸体引用都靠它
  "species_id": "cattle",         // → livestock-species.json
  "gender": "female",             // male | female | hermaphrodite
  "age_ticks": 5230,
  "weight_kg": 81.2,
  "satiety": 76.5,
  "hp": 100,
  "perks": ["big_eater", "hardy"],
  "pregnant": null,               // 或 { "father_uid": "...", "remaining_ticks": 3200 }
  "cooldowns": { "milk": 120, "blood": 0 },
  "zone_id": "z1"                 // 当前所在区域（旋转时由系统迁移）
}
```

**要点**：
- `species_id` 与动态状态分离：物种表演进（改数值）不影响已存档动物；动物实例只存 id + 状态。
- 尸体 = 该实例的 `dead: true + death_cause + decay` 状态，而非新对象；`uid` 复用，便于「清理尸体」引用。
- Perk 存 `perk_id[]`，数值从 perks.json 现查（Perk 数值改动对存量动物即时生效）。

---

## 4. 生态变量统一接口

四个区域的生态变量用统一接口，新增变量（如未来加「温度」「湿度」）通过注册完成：

```js
// 变量定义注册（内置 grass_height / compaction / pollution）
LivestockEcosystem.registerVariable({
  var_id: "grass_height",
  min: 0, max: 1.5,
  per_zone: true
});

// 读取 / 修改（delta 带 source，用于废热回收臂「回收降污量」等追溯）
LivestockEcosystem.get(zoneId, varId)                     // → number
LivestockEcosystem.modify(zoneId, varId, delta, { source }) // 夹紧到 [min,max]，发生态事件
```

- 所有生态结算（吃草减草高、踩踏加板结、羊拉污染、猪松土降污、模块加减）都通过 `modify`，**不直接改内存**。
- 废热回收臂的「回收已发生的污染下降」= 订阅生态变量的下降事件（`var_id === 'pollution' && delta < 0`）。

---

## 5. Perk modifier key 目录（可扩展）

数值型 Perk 的 `modifiers` 使用统一 key；结算器在**每个相关公式的出口**应用这些 key。首版目录：

| key | 含义 | 参与公式 |
|-----|------|---------|
| `satiety_drain_mult` | 饱腹消耗倍率 | §4 饥饿 |
| `growth_rate_mult` | 体重增长倍率 | §3.4 成长 |
| `feed_conversion_mult` | 饲料→肉转化率 | §10.1 料肉比 |
| `disease_resist_mult` | 疾病扣血倍率 | §5.4 |
| `fertility_mult` | 受孕概率倍率 | §7.1 |
| `product_cooldown_mult_{product_id}` | 某活体产出冷却倍率 | §6.1 |
| `slaughter_yield_mult` | 屠宰产出倍率 | §6.2 |
| `trample_mult` | 踩踏板结倍率 | §5.2 |
| `pollution_rate_mult` | 污染产出倍率 | §5.3 |
| `graze_rate_mult` | 吃草速率倍率 | §5.1 |

- 结算器对「每只动物」维护一个 `getModifier(key) → number`（聚合其 Perk + 模块 + 事件），默认 1。
- 新增 Perk 若只需改数值，**复用现有 key**；若需要全新维度，才在结算器加一个新 key 的出口（并在此表登记）。

---

## 6. 扩展流程（持续添加内容的标准动作）

### 新增动物种类
1. `livestock-species.json` 加一条（改数值、填 `perk_pool` / `products` / `ecosystem_impact`）。
2. `items.json` 补该物种产出（复用 §6.4 已有 item 或新增）。
3. `ui_text_zhCN.json` 加 `name_key`。
4. **无需改核心结算代码**（除非该物种引入全新机制，如「飞行」「两栖」）。

### 新增模块种类
1. `livestock-modules.json` 加一条，`effects[]` 组合现有 `effect_type`。
2. `ui_text_zhCN.json` 加 `name_key`。
3. 若效果是全新机制 → `LivestockRegistry.registerEffectHandler(new_effect_type, fn)`。
4. 若占面是新组合 → 校验 `slots` 不违反 §11.2 互斥（内部空间唯一等）。

### 新增 Perk
1. 数值型：`livestock-perks.json` 加一条，复用 `modifiers` 现有 key。
2. 机制型：加 `mechanic` + `registerEffectHandler`（或专属 handler）。
3. `ui_text_zhCN.json` 加 `name_key`。

### 新增生态变量
1. `LivestockEcosystem.registerVariable(...)`。
2. 需要该变量的模块/物种在配置里引用 `var_id`。

---

## 7. 存档兼容与迁移

- 三张配置表均带 `schema_version`；升版本时提供迁移函数，对旧存档动物实例做**字段补齐/默认值注入**，不丢玩家进度。
- 动物实例用 `uid` 为稳定主键；物种表 `species_id` 永不改名（改名需迁移映射）。
- 新增 `modifier` key / `effect_type` 时，结算器对「未知 key / 未知 effect_type」必须**告警但不崩溃**（跳过并打日志），保证旧档+新表向前兼容。
- 产出契约的新增 item_id 在 `items.json` 落地前，物种表引用缺失 item 时加载阶段应**报错**（与 `17-loading` 的「缺失 key 立即失败」一致），避免静默产出空物品。

---

## 8. 建议落地顺序

1. `LivestockRegistry`（effect handler 注册）+ `LivestockEcosystem`（生态变量接口）。
2. 三张配置表 schema + 首版数据（把 `31` 的牛/羊/猪/鸡 + 19 模块 + 全 Perk 填进去）。
3. 动物实例模型 + 生态/饥饿/成长 tick 结算器（读表 + 应用 modifier key）。
4. 繁殖/Perk 遗传 + 捕获事件 + 屠宰产出。
5. 控制面板 UI + 模块装配/升级（读模块表 + 升级材料模板）。
6. 存档读写 + 迁移。

---

*本文档与 `31-livestock-husbandry.md` 配套：31 是「设计什么、数值多少」，本文是「怎么落地、怎么扩展」。数值改 31，架构改本文。*
