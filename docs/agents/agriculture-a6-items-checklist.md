# 农业 A6 · 物品链任务清单

> 供 **A6 数据/策划 agent** 执行；建造材料已定案见 `data/agriculture-build-costs.json`（schema_version 2）与 `28-agriculture-irrigation.md` §16。  
> **禁止**：在农业面板内实现商店/金钱；种子/肥/客土仅通过背包四容器（首版）使用。

---

## 验收总闸

- [x] `npm run build:items` 后 `items.json` 含下文全部 `item_id`
- [x] 每个 `seed_*` 的 `harvest_item_id` 在 `items.json` 中有对应 `herb_*`（或产物 id）
- [x] `AgriculturePlayerItems.listSeeds()` 能列出背包中的 `seed_maize` 等（非仅香料籽）
- [x] 三档沤肥产物可注入埋瓮，且 `AgricultureConfig.getInjectableParams` 读出不同 `agriculture_fertilizer_per_tick`
- [x] `liquid_seaweed_extract` 可注入文丘里
- [x] 八种 `soil_amend_*` 带 `grants_soil_id`，`listSoilAmendments()` 可列出
- [x] 联调：藏身处可拿到至少 1 种种子 + 1 种客土 + 海藻精 + 各档肥液各 1（商人/任务/调试发放，**非农业 UI 商店**）

---

## 任务 A6-1 · 并入农业种子表（P0 阻塞）

**目标**：`data/items/seeds_farming.csv`（**50 行**）进入运行时 `items.json`。

**步骤**

1. 修改 `tools/build-items-json.mjs` 的 `MERGE_FILES`：在 `materials_all.csv` 之后（或之前，不与现有 id 冲突即可）增加 **`seeds_farming.csv`**。
2. 确认 CSV 列 `harvest_item_id` 会经构建脚本 **保留扩展列** 写入 JSON（当前 `rowToItem` 未消费列会原样落盘）。
3. 运行：`npm run build:items`。
4. 抽检：`grep '"seed_maize"' data/items.json` 存在；`category`/`sub_category`/`tags` 与 CSV 一致（`seed` / `farming` / `material;seed;farming`）。

**运行时配套（可交 A3 或本 agent）**

- `js/agriculture-player-items.js` 的 `isSeedStack`：除 `sub_category === 'seed'` 外，增加 **`category === 'seed' && sub_category === 'farming'`**（或 `tags` 含 `farming`），避免只认香料籽。

**禁止**：手改 `items.json` 而不改 CSV/构建。

---

## 任务 A6-2 · 沤肥三档液态肥 + 废档（P0）

**目标**：与 `js/compost-system.js` 产出 id 一致，农业埋瓮可扣物。

| item_id | 用途 | 农业字段（CSV 扩展列 → items.json） |
|---------|------|-------------------------------------|
| `fertilizer_basic_low` | 沤肥·差 | `inject_facility=buried_pot_jar`，`agriculture_buried_jar_injectable=true`，`agriculture_fertilizer_per_tick=0.35`，`is_anaerobic_fertilizer=true` |
| `fertilizer_basic` | 沤肥·中 | `agriculture_fertilizer_per_tick=0.5`，同上 |
| `fertilizer_compost_plus` | 沤肥·优 | `agriculture_fertilizer_per_tick=0.75`，同上 |
| `fertilizer_batch_void` | 沤肥废渣 | **无** `is_anaerobic_fertilizer`；不可注入埋瓮 |

**建议**：新建 `data/items/fertilizer_anaerobic_base.csv`（或扩 `materials_all.csv`），列结构与 `compost_matrix_base.csv` 对齐（`sn/placeholder_name/fn_before/fn` 等语言字段必填）。

**数值权威**：`data/agriculture-item-params.json` → `injectables`（构建后以 items 为准，params 作回退）。

**参考**：`docs/design/23-fertilizer-bin-station.md` §23.7。

---

## 任务 A6-3 · 海藻精（P0）

**目标**：文丘里注入物。

| 字段 | 值 |
|------|-----|
| `item_id` | `liquid_seaweed_extract`（与 28 / Demo 一致） |
| `inject_facility` | `venturi_fertilizer` |
| `agriculture_venturi_injectable` | `true` |
| `agriculture_venturi_effect_duration_ticks` | `5000` |

**来源建议**：`life_pharmacy` 或 `life_manufacturing` 配方（单独策划表）；首版可用商人/任务发放。

**禁止**：注入埋地陶瓮（与 §2.2d/e 冲突）。

---

## 任务 A6-4 · 客土八种（P0）

**目标**：换土消耗品；`grants_soil_id` 写入耕地。

| item_id | grants_soil_id | 展示名（sn） |
|---------|----------------|--------------|
| `soil_amend_yellow_cotton` | `soil_yellow_cotton` | 黄绵土客土 |
| `soil_amend_cinnamon` | `soil_cinnamon` | 褐土客土 |
| `soil_amend_purple` | `soil_purple` | 紫色土客土 |
| `soil_amend_red` | `soil_red` | 红壤客土 |
| `soil_amend_alpine_meadow` | `soil_alpine_meadow` | 高山草甸土客土 |
| `soil_amend_paddy` | `soil_paddy` | 水稻土客土 |
| `soil_amend_black` | `soil_black` | 典型黑土客土 |

**说明**：盐碱土为地图默认土，可不配客土物品。  
**长期链**：堆肥基质 → 制造 → 带 `grants_soil_id` 的终局土（见 23-fertilizer-bin-station）；首版可先做直接客土物品。

**构建**：`grants_soil_id` 为扩展列，须非空写入 `items.json`。  
**回退**：`agriculture-item-params.json` → `soil_amend_fallback` 在 items 未就绪前供 `AgricultureConfig.getGrantsSoilId`。

---

## 任务 A6-5 · 种子获取（策划，非农业商店）

**目标**：玩家能在藏身处流程中拿到可播种子。

**最小集（联调）**

- 至少：`seed_maize` 或 `seed_peanut`（与 `agriculture-crop-defs` 示范一致）
- 二档及以上种子：用 **商人 / 任务 flag / `life_planting` 等级** _gate，**不复用** `agriculture-seed-shop.json` 的 `tier_trade_unlock` / 价格

**`agriculture-seed-shop.json` 去向**

- 保留：`groups`、`grow_note`、`harvest_item_id` 等**元数据**（可选迁到 crop-defs 或策划表）
- 废弃运行时加载：~~`price`~~、~~`demo_sell_price`~~、~~`tier_trade_unlock`~~

---

## 任务 A6-6 · 建造材料（已完成，仅核对）

**文件**：`data/agriculture-build-costs.json` v3。

**确认** `items.json` 均存在：

- `wood_bamboo_green`, `wood_plank_soft`, `wood_shrub_dry`
- `ore_clay_raw`, `supply_rope_hemp_short`
- `tool_pickling_jar_cooking`（埋瓮；不扣 `tool_pot_clay_cooking` / `tool_fermentation_jar_cooking`）
- `compost_matrix_grade_low`, `compost_matrix_grade_high`
- `ore_iron_raw`（文丘里 3 级升级）

无需新增物品 id，除非策划改表。

---

## 任务 A6-7 · 构建脚本与字段约定（P1）

1. 在 `tools/build-items-json.mjs` 的 `handled` 白名单中**不要**吞掉农业字段；或保持现状（扩展列自动保留）。
2. 可选：在 `docs/design/27-item-template-fields-inventory.md` 或 28 §16 登记农业字段枚举：
   - `grants_soil_id`
   - `inject_facility`
   - `agriculture_venturi_injectable`
   - `agriculture_buried_jar_injectable`
   - `agriculture_fertilizer_per_tick`
   - `agriculture_venturi_effect_duration_ticks`
   - `is_anaerobic_fertilizer`
   - `harvest_item_id`（种子行，可选）

3. `npm run audit:item-field-rules`（若项目有）对新增列跑一遍。

---

## 任务 A6-8 · 验证脚本（建议）

```bash
node tools/build-items-json.mjs
# 人工或脚本检查：
# node -e "const j=require('./data/items.json'); const ids=['seed_maize','fertilizer_basic','liquid_seaweed_extract','soil_amend_paddy']; ids.forEach(id=>console.log(id, !!j[id]));"
```

---

## 与其它 Agent 的接口

| Agent | 依赖 A6 |
|-------|---------|
| A1 仿真 | 不依赖 items；crop-defs/soils 已独立 JSON |
| A3 编排 | 依赖 listSeeds / inject / payBuildCost 物品存在 |
| A4 UI | 播种/注入列表来自 `AgriculturePlayerItems` |
| A5 入口 | 无物品依赖 |

---

## 禁止事项（A6）

- 禁止恢复农业面板内金钱/商店/交易额。
- 禁止只改 `agriculture-item-params.json` 而不补 `items.json`（params 仅过渡回退）。
- 禁止 `buried_pot_jar` 建造扣 `tool_pot_clay_cooking` 或 `tool_fermentation_jar_cooking`（已改为腌缸 `tool_pickling_jar_cooking`，见 build-costs v3）。
