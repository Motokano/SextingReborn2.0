# 野外采集点与生产系归类（供 Agent / 策划对齐）

> **Cursor 规则源**：`.cursor/rules/wild-gathering-points-agent.mdc`（`alwaysApply: true`）。本 Markdown 为便于检索的副本，内容应与 `.mdc` 同步。

编辑**野外资源格、采集点配置、地图 `entity_id`、与五类野外采集技能相关的数值或文档**时，以本节为硬约定；细则仍以 `docs/design/11-skills.md`（§8.2、采集机制）、`docs/design/02-regions.md`（野外）为准。

## 生产系生活技能结构（四类）

| 子类 | 技能 | 互动对象 |
|------|------|----------|
| **野外采集点** | 钓鱼、挖矿、伐木、狩猎、采集 | 野外**采集点**格，通过对应技能获得物品 |
| **藏身处地块** | 畜牧、种植 | 藏身处 **耕地、牧场** 等地块 |
| **藏身处设施** | 锻造、烹饪、制药、纺织、制造、改造 | 藏身处 **工作台/设施** |
| **待定** | 贸易、鉴定、物流管理 | 提升方式与表现形式待定（**已移除「谈判」技能**，贸易文档中不再引用独立谈判技能） |

## 采集点不枯竭

- 所有野外**采集点**不因交互次数进入「采空 / 待刷新（因枯竭）」状态。
- 玩家侧停止条件示例：背包满、体力空、手动停止挂机等。
- `docs/design/02-regions.md` 中若仍有「采完后按行动回合数刷新」类表述，应视为**与本文冲突**，落盘时删改或注明**非**枯竭刷新。

## 采集点分类 → 唯一绑定五类采集技能之一

- 每个采集点配置须带 **分类字段**，决定该格仅能与 **钓鱼、挖矿、伐木、狩猎、采集** 中的**一个**技能轨道互动。
- **配置字段名（建议）**：`wild_interaction_category`。
- **取值枚举**：

| `wild_interaction_category` | 对应生活技能（中文） | 备注 |
|-----------------------------|----------------------|------|
| `fishing` | 钓鱼 | 钓鱼点、水域等 |
| `mining` | 挖矿 | 矿脉等 |
| `logging` | 伐木 | 树林、竹木等 |
| `hunting` | 狩猎 | 狩猎区等 |
| `gathering` | 采集 | 技能 ID `life_gathering`；`gathering_bush` / `gathering_grass` 属本类 |

- **`entity_id`** 与分类分工：地图可用 `entity_id` 区分视觉子类型；**授权哪条技能**以 `wild_interaction_category` 为准。
- **现行数据**：未写字段时实现可默认 `gathering`；**新配点应显式写出**。

## 采集点实例与分物品品质硬上限

- **主配置**：`data/gathering_point_instances.json`（`defaults` + `instances[].loot_rows`）。每行可设 **`quality_tier_max`（1～6）**：熟练度上修后的**硬上限**；缺省等同 **6**。
- **地图引用**：格子上可选 **`gathering_instance_id`**；未写则用 `defaults[entity_id]`。
- **工具**：`tools/gathering-point-editor.html`（与 `data/items.json` 联动下拉选物品）；地图绑定 `tools/map-editor.html`。
- **地牢**：随机生成时实体列表与野外相同字段即可，参见 `data/editor/dungeon_gathering_presets.example.json`。

## 实现索引

- `data/gathering_point_instances.json`、`data/gathering_points.json`（兼容/回落）、`js/gathering.js`、`js/scene-app.js`、`js/game-engine.js`（`getEntityRecordAt`）、`data/maps/**/*.json`

## 勿混用

- 生存技能 `survival_*`、战斗技能 `combat_*` 与本节野外采集点分类无关。
- 烹饪文档中「来源：采集」为材料学分类，配置须落到具体技能/产出表。
