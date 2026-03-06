# 贸易与旅行商人 — 配置表模板与概念说明

本文档说明实现贸易与旅行商人系统时用到的配置表**概念**、**表头**与**示例字段**；行为与规则以 `basic.md` 第 9 章为准。

---

## 1. 地图表 / 场景表（scene_type）

**概念**：每张可进入的地图（或场景）在配置中有一条记录。其中 **scene_type** 表示该地图作为「交易场景」的类型；玩家在该地图内与商人对话并选择「交易」时，用此地图的 scene_type 决定本次交易上下文（限额、是否允许挂单等）。若 scene_type 为空或未配置，表示该地图不可与商人进行场景交易。一地图只对应一个 scene_type，做地图时配置。实现时若需「出口、方向、是否允许旅行商人」等，可在地图表中增加**可选字段**，命名与含义由实现统一。

**主要字段（示例）**

| 字段名（示例） | 说明 |
|----------------|------|
| map_id         | 地图/场景唯一标识 |
| scene_type     | Market / Shop / Exchange / Travel 或空；空表示不可交易 |

**示例行（示意）**

| map_id | scene_type |
|--------|------------|
| town_market_01 | Market |
| road_field_02  | Travel |
| dungeon_entrance | （空） |

---

## 2. trading_scene_rules.csv（场景规则表）

**概念**：按 **scene_type** 给出该场景下的通用规则，例如本场景下商人资金池的系数、默认周期长度等。程序在打开交易界面时根据当前 scene_type 读取本表；特殊 NPC 若配置了自有的周期或上限，则覆盖本表对应项。

**主要字段（示例）**

| 字段名（示例）     | 说明 |
|--------------------|------|
| scene_type         | Market / Shop / Exchange / Travel |
| merchant_pool_modifier | 本场景下商人资金池系数，如 1.0、0.8；空或 1.0 表示不修正 |
| period_duration    | 周期长度默认值；**单位与示例写法留待实现时统一约定**（如游戏日、现实分钟等），供按物品限额的 period 使用 |

**示例行（示意）**

| scene_type | merchant_pool_modifier | period_duration |
|------------|------------------------|-----------------|
| Market     | 1.0                    | 1d              |
| Travel     | 0.8                    | 1d              |
| Shop       | 1.0                    | 1d              |
| Exchange   | 1.0                    | 6h              |

---

## 3. merchant_scene_allowed.csv（商人类型–场景类型允许表）

**概念**：定义哪种**商人类型**允许在哪种 **scene_type** 下与玩家交易。一行一对 (merchant_type, scene_type)；若 (当前商人类型, 当前场景类型) 在本表中有记录，则允许打开交易，否则校验不通过并提示「对方不愿在此地交易」等。匹配规则可配置、便于后续修改。

**表头（示例）**

| 字段名（示例） | 说明 |
|----------------|------|
| merchant_type  | 摊贩 / 店主 / 旅行商队 |
| scene_type     | Market / Shop / Exchange / Travel |

**示例行（示意）**

| merchant_type | scene_type |
|---------------|------------|
| 摊贩          | Market     |
| 店主          | Shop       |
| 旅行商队      | Market     |
| 旅行商队      | Exchange   |
| 旅行商队      | Travel     |

---

## 4. item_trade_limits.csv（按物品的购买限额表）

**概念**：对**需要单独限量的具体物品**配置「在某商人或某场景下」的**会话上限**与**周期内上限**。未出现在本表中的物品仅受商人库存限制。计量按堆叠单位（件/个）；周期按玩家–商人、按物品分别累计。特殊 NPC 可为某物品配置自有 session_cap / period_cap / period_duration，覆盖本表或场景默认。若将来需要「**某商人 + 某场景**」联合限定（如同一商人在 Travel 与 Market 下某物品限额不同），可实现为按 (merchant_id, scene_type) 联合键或等价配置。

**表头（示例）**

| 字段名（示例）   | 说明 |
|------------------|------|
| item_id          | 物品唯一标识 |
| merchant_id 或 scene_type | 商人 ID（按商人限）或 scene_type（按场景限）；实现二选一或同时支持 |
| session_cap      | 本会话内该物品最多卖给该玩家的件数 |
| period_cap       | 本周期内该物品最多卖给该玩家的件数 |
| period_duration  | 周期长度；可省略则用场景规则表默认值。**单位与示例写法留待实现时统一约定**（与 trading_scene_rules 一致） |

**示例行（示意）**

| item_id   | scene_type | session_cap | period_cap | period_duration |
|-----------|------------|-------------|------------|-----------------|
| rare_herb_01 | Travel  | 3           | 10         | 1d              |
| task_item_02  | Market  | 1           | 5          | 1d              |

---

## 5. 与商人模板、basic 的对应关系

- 商人个体配置（称呼、态度、资金池、库存、接受货币等）见 `trader_template.md`。
- 交易场景分级、交易上下文、单次会话与周期限制、出售时资金池不足与换商誉等规则见 `basic.md` 第 9.2 节。
- 表头与字段名可在实现时调整，保持与上述概念一致即可。

## 6. 实现备注（无配置时的默认行为）

便于实现与排查配置问题时参考：

- **地图表**：若某地图无 `scene_type` 或 scene_type 为空，则该地图不可与商人进行场景交易；选「交易」时按「此地不宜谈生意」处理。
- **merchant_scene_allowed**：若当前 (merchant_type, scene_type) 在表中**无匹配行**，则校验不通过，不允许打开交易界面，按「对方不愿在此地交易」提示。
- **item_trade_limits**：若某物品在表中**无对应行**，则该物品**不受会话/周期限额**，仅受商人库存约束。
- **trading_scene_rules**：若某 scene_type 在表中无行，实现时需约定默认值（如 merchant_pool_modifier = 1.0、period_duration 取全局默认等）。
