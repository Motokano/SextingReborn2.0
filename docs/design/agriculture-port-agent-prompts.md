# 农业移植 · 分 Agent Prompt 包

> 用法：每个任务复制对应 **「Prompt」** 整段给独立 agent。所有 agent 必须先读 **「全局约束」** 与 `docs/design/28-agriculture-irrigation.md` §16。  
> 仓库路径：`SextingReborn2.0`（Windows 示例：`c:\Users\admin\Desktop\SextingReborn2.0`）。

---

## 执行顺序

```text
A0（文档，可选半天）
  ↓
A1 仿真 ║ A2 存档 ║ A6 物品链（可并行；A6-1～4 阻塞 A3 联调）
  ↓
A3 编排（依赖 A1+A2；部分依赖 A6）
  ↓
A4 UI ║ A5 世界入口（并行，依赖 A3 公开 API）
  ↓
联调总验收（文末清单）
```

**`scene-app.js` 冲突控制**：仅 **A3** 写 tick 钩子与 `SceneApp.*` API；**A4** 优先只调 API，或只改 `js/agriculture-panel.js`（由 A3 建空壳并 `index.html` 引脚本）。

---

## 全局约束（贴进每个 Prompt 开头）

```text
【农业移植 · 全局硬约束】
- 规则权威：docs/design/28-agriculture-irrigation.md（§15.0 tick 顺序、§16 本体接入）、data/agriculture-crop-defs.json、data/agriculture-soils.json。
- 无农业金钱/商店/交易额/Demo 临时背包；种子与投入品只来自 InventoryEquipment 四容器（口袋/背心/背包/载具，首版不含玩家仓库）。
- 扣物唯一入口：AgriculturePlayerItems + AgricultureConfig（js/agriculture-player-items.js、js/agriculture-config.js）；禁止农业 UI 自写扣物。
- 全局 tick：已解锁农业后，每个 world tick 必须跑 1 次 runAgricultureMapTick（任意地图、面板开闭无关）。
- 工程（挖渠/建造/升级/客土工程等）：仅 agriculturePanelOpen===true 时推进；关面板冻结工程进度，作物仍随全局 tick 生长。
- 面板内耗时操作须调统一 advanceTick（与制肥一致），禁止农业私有时钟。
- 收获熟练度：harvestCount 份（仅入背包成功）→ life_planting + harvestCount（incrementSkillMoveUsage('life_planting','harvest',n) + recalcCharacterStats）。
- 单图 11×11；入口仅藏身处农业 NPC（邻格点格 interactNpc）。
- 首版全量：种植+收获+灌溉+文丘里/埋瓮/超融合+客土+耕地建造物，一次交付（不分「无灌溉先试玩」）。
- traceAbsorbed / fertilizerAbsorbed 分轨，禁止混写。
- 建造材料：data/agriculture-build-costs.json schema_version 3（已落盘）；埋瓮扣 tool_pickling_jar_cooking（腌缸），不扣 tool_pot_clay_cooking / tool_fermentation_jar_cooking。
- 已有契约层勿重写：agriculture-player-items、agriculture-config、build-costs、item-params；loadConfig 已 fetch 后两者。
- Standalone：改规则先改 js/agriculture-map.js，再 build standalone；禁止长期双份公式。
```

---

## A0 · 文档冻结

### Prompt

```text
你是本仓库的文档 agent。任务：冻结农业移植口径，不写游戏逻辑代码。

【农业移植 · 全局硬约束】
（粘贴上文「全局约束」全文）

请完成：
1. 核对 docs/design/28-agriculture-irrigation.md §16 是否与下列一致；缺则补写：
   - 全局 tick 与工程「仅开面板推进」分工
   - 收获按份数加 life_planting 熟练度
   - 建造材料 v2 摘要
   - 指向 agriculture-a6-items-checklist.md、agriculture-port-agent-prompts.md
2. 若 docs/design/00-index.md 仍写 33×33 农业地图，改为 11×11 或注明以 28 为准。
3. 输出简短「变更摘要」供主程确认。

禁止：改 js/agriculture-map.js、scene-app 逻辑、items.json 手改。
验收：§16 单独阅读即可理解 tick/工程/库存/入口，无与全局约束矛盾句。
```

---

## A1 · 仿真抽取（agriculture-map.js）

### Prompt

```text
你是本仓库的实现 agent。任务：从农业 Demo 抽出无 DOM 的纯仿真模块。

【农业移植 · 全局硬约束】
（粘贴上文「全局约束」全文）

源码参考（抽取来源，行为须一致）：
- tools/agriculture-irrigation-demo.html 或 agriculture-standalone.html 内联脚本
- 重点：recomputeIrrigationNetwork、runAgricultureMapTick（§15.0 ①～5a～5b～5c～⑦）、工程 task、种植/收获/枯萎、文丘里 A/B 面、埋瓮施肥、超融合、客土 soil_id、生长分与 harvestCount

交付：
1. 新建 js/agriculture-map.js，挂载 window.AgricultureMap（或 ES 模块若项目惯例允许）。
2. 对外 API 至少包含：
   - createDefaultState() → 11×11 默认图（水池 (0,0)、默认盐碱土等，与 Demo 一致）
   - runAgricultureMapTick(state, env)  // env: cropDefs, soils, resolveInjectParams(itemId)
   - advanceConstructionTask(state, ctx)  // ctx: panelOpen, stamina 读写；panelOpen false 时不推进 task
   - 纯函数 try*：播种/收获/开工建造等，返回 { ok, reason?, ... }，不碰背包
3. 新建 tools/test-agriculture-map.mjs：固定 state 跑 N tick，断言关键格（水量/浓度/作物条）与 Demo 一致或文档误差内。
4. index.html 暂不强制引用（A3 接线）；但脚本须 node --check 通过。

禁止：document、fetch、InventoryEquipment、金钱、商店。
禁止：在 scene-app 里塞仿真。
验收：node tools/test-agriculture-map.mjs 通过；runAgricultureMapTick 顺序与 28 §15.0 一致。
后续：build-agriculture-standalone 应改为引用本文件（可记 TODO，非本任务必须完成）。
```

---

## A2 · 存档

### Prompt

```text
你是本仓库的实现 agent。任务：农业地图写入存档。

【农业移植 · 全局硬约束】
（粘贴上文「全局约束」全文）

交付：
1. js/save-system.js：buildSnapshot / applySnapshot 增加 agriculture_map（含 schema_version）。
2. 新档默认：AgricultureMap.createDefaultState()（依赖 A1；若 A1 未完成可用最小占位结构 + TODO，但读档须稳定）。
3. 缺字段迁移：无 agriculture_map 时补默认图。

禁止：改 tick 钩子（属 A3）、改 UI。
验收：存档→读档后 agriculture_map 格数据一致；不破坏现有 sceneUi 字段。
```

---

## A3 · 编排与全局 tick

### Prompt

```text
你是本仓库的实现 agent。任务：农业接入主循环与 SceneApp API。

【农业移植 · 全局硬约束】
（粘贴上文「全局约束」全文）

依赖：js/agriculture-map.js（A1）、存档字段（A2）、AgriculturePlayerItems、AgricultureConfig（已存在）。

必须实现：
1. agriculturePanelOpen：open/close 农业模态时置位（模态 DOM 可由 A4 建，本任务可先占位 id modal-agriculture）。
2. 在唯一 world tick 入口（与 Survival.advanceTick / 制肥一致处）追加：
   - 若已解锁农业：AgricultureMap.runAgricultureMapTick(mapState, env)
   - 若 agriculturePanelOpen：AgricultureMap.advanceConstructionTask(..., { panelOpen:true, stamina... })
3. loadConfig 增加 fetch（若尚无）：agriculture-crop-defs.json、agriculture-soils.json → 供 env 使用。
4. SceneApp 公开 API（供 A4）：
   - openAgriculturePanel / closeAgriculturePanel
   - getAgricultureMapState() 只读
   - tryAgricultureAction(actionId, params) → 内部用 AgriculturePlayerItems 扣物、改 mapState、需要时 advanceTick
   - payBuildCost(buildId) 封装 AgriculturePlayerItems.payBuildCost
5. 收获成功：incrementSkillMoveUsage('life_planting','harvest', harvestCount) + recalcCharacterStats
6. 解锁：首次农业 NPC 交互或 flag 创建 agriculture_map（与 A5 对齐一种即可）

可选：新建 js/agriculture-panel.js 空壳 export render/update，由 A4 实现体。

禁止：在 UI 文件写 runAgricultureMapTick；禁止第二套扣物；禁止农业金钱。
验收：
- 关面板：作物数值随全局 tick 变、工程 progress 不变
- 开面板：工程随 tick 推进（体力不足暂停工程、作物仍长）
- 收获 7 份 → life_planting harvest 用法 +7
```

---

## A4 · UI 模态

### Prompt

```text
你是本仓库的 UI agent。任务：农业 11×11 面板，主题对齐背包/战斗技能 UI。

【农业移植 · 全局硬约束】
（粘贴上文「全局约束」全文）

依赖：仅调用 SceneApp.open/close、tryAgricultureAction、getAgricultureMapState；不直接改 save 对象。

交付：
1. index.html：#modal-agriculture + 作用域 CSS（文本为主、与 #modal-backpack / 战斗弹窗色调一致；禁止赛博霓虹）。
2. 11×11 格渲染、选中格菜单：开垦、渠、文丘里、埋瓮、超融合、建造物、客土、播种（列表来自 listSeeds 逻辑，由 API 返回）、注入、收获。
3. 工程进度显示在格上；侧栏地块信息；无商店/金钱/交易额。
4. 所有可见中文 data/ui_text_zhCN.json（缺 key 会 throw）；含「仅使用随身与载具物品」类提示。
5. tick 后刷新：A3 在 advance 后调用 updateAgriculturePanel（你提供函数名并挂到 SceneApp）。

禁止：state.money、agriculture-seed-shop 商店 UI、复制灌溉公式、直接 InventoryEquipment.take。
验收：完整流程可玩（引水→肥→种→关面板等待→开收）；6 条以上主题对齐说明可写在 PR 描述。
```

---

## A5 · 世界入口（藏身处 NPC）

### Prompt

```text
你是本仓库的数据+接线 agent。任务：藏身处打开农业面板入口。

【农业移植 · 全局硬约束】
（粘贴上文「全局约束」全文）

参考：life-workbench-interaction-agent（灶台/制肥桶）：占格不可走、邻格点格 interactNpc、NPC mainMenu 按钮。

交付：
1. 藏身处地图 JSON：annotations + agriculture_station_interact_npc_by_cell（或项目统一命名，与 cooking_station_* 平行）。
2. js/game-engine.js：农业设施格 isWalkable false（与 isCookingStationCell 同类）。
3. NPC def：tags 含 agriculture_station；mainMenu 按钮调用 SceneApp.openAgriculturePanel()。
4. data/npc/npc_registry.json 登记 def、triggers、dialogue_pools（三条路径）。
5. data/ui_text_zhCN.json：菜单与提示 key。

禁止：邻格自动气泡开农业；禁止农业 tick 绑「站在 NPC 旁」。
验收：邻格点设施/NPC 格→对话→打开农业；非邻格不可开。
```

---

## A6 · 物品链

### Prompt

```text
你是本仓库的数据 agent。任务：农业所需物品进 items.json，详见 checklist。

【农业移植 · 全局硬约束】
（粘贴上文「全局约束」全文）

权威清单：docs/design/agriculture-a6-items-checklist.md（逐条完成并勾选）。

核心交付：
- A6-1：seeds_farming.csv 并入 tools/build-items-json.mjs → npm run build:items；修正 isSeedStack 认 category seed + sub_category farming
- A6-2～4：fertilizer_* 三档 + void、liquid_seaweed_extract、soil_amend_* 八种（grants_soil_id）CSV + 构建
- A6-5：种子/肥/客土/海藻精获取（商人或任务，非农业商店）
- A6-6：核对 build-costs v3 材料 id 均存在于 items.json（含 tool_pickling_jar_cooking、compost_matrix_grade_low、wood_shrub_dry）

禁止：农业面板商店；禁止只改 agriculture-item-params 不补 items；禁止埋瓮扣 tool_pot_clay_cooking。
验收：checklist 顶部「验收总闸」全部满足。
```

---

## 联调总验收（主程 / 最后一棒）

- [x] NPC 开面板 → 开垦 → 挖渠 → 文丘里注海藻精 → 瓮注三档肥之一 → 客土 → 带建造物播种 → 成熟收获（仿真：`node tools/test-agriculture-e2e-chain.mjs`；NPC 开面板仍须浏览器点一次）
- [x] 关面板野外若干 tick → 再开：作物变、**工程进度不变**（`test-agriculture-map.mjs` + `tickAgricultureAfterWorldTick` 接线）
- [x] 开面板若干 tick：工程完成、体力符合 build-costs（`applyTask` 已补全；体力扣 `advanceConstructionTask`）
- [x] 收获 N 份 → `life_planting` +N 熟练度（仅 `placedCount`；`peekHarvestAt` → 入包 → `commitHarvestAt`）
- [x] 无金钱/商店 UI；种子列表仅背包已有
- [x] 存档重载：设施/作物/渠网正确（`test-agriculture-save.mjs`）
- [x] `node tools/test-agriculture-map.mjs` 通过
- [x] 一键核对：`node tools/verify-agriculture-acceptance.mjs`

---

## 文件归属速查

| 文件/目录 | 主责 Agent |
|-----------|------------|
| `js/agriculture-map.js` | A1 |
| `tools/test-agriculture-map.mjs` | A1 |
| `js/save-system.js`（agriculture_map） | A2 |
| `js/scene-app.js`（tick、SceneApp API） | A3 |
| `js/agriculture-panel.js`（可选） | A3 壳 + A4 体 |
| `index.html`（#modal-agriculture CSS） | A4 |
| `data/maps/*`、`data/npc/*`、`game-engine.js` | A5 |
| `data/items/*`、`build-items-json.mjs`、`items.json` | A6 |
| `data/agriculture-build-costs.json` | 已定案；A6 仅核对 |
| `docs/design/28-*.md`、`agriculture-a6-items-checklist.md` | A0 |

**已存在勿推翻**：`js/agriculture-player-items.js`、`js/agriculture-config.js`、`data/agriculture-item-params.json`。

---

# Phase 2 · Demo ↔ 本体同步（2026-06 更新包）

> **背景**：首版移植骨架（A1～A5）已落地；`tools/agriculture-irrigation-demo.html` / `agriculture-standalone.html` 仍为策划试玩与 E2E 参考。本节基于**当前仓库实测**给出差距矩阵与**增量** agent Prompt；勿重复造轮子重写已接线模块。

## 差距矩阵（Demo vs 本体 · 当前状态）

| 能力 | Demo / Standalone | 本体（主游戏） | 状态 | 主责 |
|------|-------------------|----------------|------|------|
| 11×11 仿真 tick（§15.0） | ✓ | `js/agriculture-map.js` + `runAgricultureMapTick` | **已同步**（经 standalone 抽取） | S5 维护构建 |
| 池水天气（±30% / tick） | `applyPoolWeatherStep0` | map 内同函数；**未**接主游戏天气 API | **部分** | S2 |
| 蓄水池 / 窃流 L2～L4 | UI + 仿真 | 仿真在 map；**无**面板升级/窃流配置 UI | **缺 UI + 升级表** | S3 + S4 |
| 金钱 / 种子商店 / 临时背包 | ✓（调试专用） | **故意无**（§16.3） | **设计正确** | S1 清 dead code |
| 全局 tick + 关面板冻工程 | Demo 私有时钟 | `Survival.advanceTick` → `tickAgricultureAfterWorldTick` | **已同步** | — |
| 存档 `agriculture_map` | — | `save-system.js` | **已同步** | — |
| SceneApp API + 扣物 | — | `tryAgricultureAction` + `AgriculturePlayerItems` | **已同步** | — |
| 农业面板基础操作 | 全菜单 | `agriculture-panel.js`：开垦/渠/设施/客土/种/收/注入 | **大部分** | S3 |
| 水渠升/降级 | ✓ | **无** action + UI | **缺** | S3 |
| 文丘里浓度 ± / 滑条 | ✓ | API `set_venturi_concentration` 有，**UI 无** | **缺** | S3 |
| 工程暂停/继续 | ✓ | **无** | **缺** | S3 |
| 地块详情（浓度/藻/支路/天气倍率） | 侧栏丰富 | 侧栏精简 | **部分** | S3 |
| 格视觉（垄沟纹理/作物/设施 icon/藻爆发） | 完整 CSS | `#modal-agriculture` 色块级 | **缺** | S3 |
| 视口平移缩放 | ✓ | **无**（11×11 可不做） | 低优 | — |
| 藏身处 NPC 入口 | — | 地图 + `npc.station.agriculture_base` | **已同步** | — |
| 物品链（50 种子/肥/客土/海藻精） | 内嵌 JSON | A6 checklist **已勾完** | **已同步** | S6 |
| 水池升级材料表 | Demo 扣金 | `agriculture-pool-upgrades.json` 有、`build-costs` **无 pool 条目** | **缺** | S4 |
| 构建链 | demo → standalone → map | map **非**单一真相源；map 残留 DOM/商店函数 | **技术债** | S1 + S5 |
| 设计文档 §8.5 | — | 仍写 `pool_budget_effective_day`；Demo 已改 tick 天气 | **文档漂移** | S0 |
| 导出符号 | 曾误留 `applyPoolReservoirStep0` | demo 已修；**须** `npm run build:agriculture-map` | **待重建** | S5 |
| 收获入包顺序 | — | `peekHarvestAt` → 入包 → `commitHarvestAt`；背包满 `inventory_full` 保留 crop | **已修** | — |

## Phase 2 执行顺序

```text
S0 文档口径（半天，可与 S1 并行）
  ↓
S1 仿真清理 + 收获 bug ║ S5 构建链加固（并行）
  ↓
S2 天气注入桥接（依赖 S0 口径）
  ↓
S4 水池升级数据 ║ S6 物品链（并行）
  ↓
S3 UI/交互补齐（依赖 S2/S4 API）
  ↓
S7 联调总验收（Phase 2 清单）
```

**冲突控制**：`js/agriculture-map.js` 仅 **S1/S5** 改仿真；**S2** 只改 `scene-app` 的 `buildAgricultureEnv` / tick 注入；**S3** 只改 `agriculture-panel.js` + `index.html` CSS + `ui_text`；**S4** 只改 `data/*.json` + `agriculture-config.js`。

---

## Phase 2 全局约束（贴进每个 Prompt 开头）

```text
【农业 Phase 2 · 全局硬约束】
- 规则权威：docs/design/28-agriculture-irrigation.md（§15.0、§16）；仿真实现权威：js/agriculture-map.js（经 tools/build-agriculture-map-js.mjs 与 demo 同步）。
- Demo/Standalone 用途：策划试玩、E2E 对照、视觉参考；**禁止**在本体 reintroduce 金钱/商店/临时背包。
- 改仿真公式：先改 tools/agriculture-irrigation-demo.html → npm run build:agriculture-standalone → npm run build:agriculture-map → node tools/test-agriculture-map.mjs；禁止长期 demo/map 双份公式。
- 主游戏天气：§8.5.1 规定农业**不自行 roll 整日天气**；生产环境由 scene-app 向 env 注入 poolWeatherFactor 或 poolBudgetEffectiveDay。Demo 的「每 tick ±30% 随机」仅作 **sandbox**，须在 env 未注入时 fallback，且与文档 Demo 注一致。
- 扣物 / tick / 工程分工：沿用 Phase 1 全局约束（AgriculturePlayerItems、agriculturePanelOpen、advanceTick）。
- 新增 UI 文案：data/ui_text_zhCN.json（UIText 强校验）。
- 新增建造/升级：data/agriculture-build-costs.json schema_version 2，材料 id 须在 items.json。
- 已存在勿推翻：agriculture-player-items、agriculture-config、save agriculture_map、NPC 入口接线。
```

---

## S0 · 文档与口径对齐

### Prompt

```text
你是文档 agent。任务：对齐 Demo 现行为、§8.5 与 Phase 2 实现口径。

【农业 Phase 2 · 全局硬约束】
（粘贴上文 Phase 2 全局约束全文）

请完成：
1. 更新 docs/design/28-agriculture-irrigation.md §8.5：
   - 主游戏：按日 pool_budget_effective_day（或等价 env 字段）+ 蓄水池逻辑不变。
   - Demo/Standalone：明确写「每 tick 天气倍率 ∈ [0.7, 1.3]（last_pool_weather_factor）」为 sandbox；与主游戏注入优先级（env 有值则不用 random）。
2. §16 增一小节「Phase 2 缺口索引」→ 指向本文 Phase 2 差距矩阵。
3. docs/design/00-index.md 若有 33×33 农业描述，改为 11×11。
4. 输出变更摘要（3～8 条）。

禁止：改 JS。验收：§8.5 同时读懂主游戏与 Demo 差异，无「仅 pool_budget 下拉」过时描述。
```

---

## S1 · 仿真清理 + 已知 bug

### Prompt

```text
你是实现 agent。任务：净化 agriculture-map.js 并修收获顺序 bug。

【农业 Phase 2 · 全局硬约束】
（粘贴 Phase 2 全局约束）

现状问题（须处理）：
- js/agriculture-map.js 仍含 Demo 泄漏：tryUpgradePool（扣 state.money）、renderPoolUpgradePanel、syncPoolTheftFromDom 等引用 el.* / document。
- tools/build-agriculture-map-js.mjs 的 removeNames 未剔除上述函数。
- tryHarvestAt 在 scene-app harvest 流程中可能「先清 crop 后入包失败丢产出」。

交付：
1. 在 build-agriculture-map-js.mjs 的 removeNames 追加：renderPoolUpgradePanel、tryUpgradePool、syncPoolTheftFromDom、readPoolTheftFromDom、demoSellPriceFromShop、seedSellPrice、cropSellPrice 及一切仍引用 el./document 的函数。
2. 从 demo 删除或改为仅 Demo 导出的金钱池升级 UI；map 导出改为纯函数 tryUpgradePoolLevel(state) 预留（可 stub，不扣 money）。
3. scene-app harvest：仅入包成功后再清 crop；或 tryHarvestAt 改为 preview + commit 两阶段（与现有 API 最小 diff）。
4. npm run build:agriculture-map && node tools/test-agriculture-map.mjs && node --check js/agriculture-map.js

禁止：改 agriculture-panel UI；禁止恢复农业商店。
验收：map.js 内 ripgrep document\.|el\.|state\.money 为 0（测试桩除外）；收获背包满时不丢 crop 状态。
```

---

## S2 · 主游戏天气 → 农业 env 桥接

### Prompt

```text
你是实现 agent。任务：scene-app 向 AgricultureMap env 注入池水天气，替代盲 random。

【农业 Phase 2 · 全局硬约束】
（粘贴 Phase 2 全局约束）

参考：§8.5.1、data/agriculture-pool-upgrades.json、buildAgricultureEnv()。

交付：
1. buildAgricultureEnv() 增加可选字段（命名与 map 对齐，二选一或并存）：
   - poolWeatherFactor：number，本 tick 相对 baseline 200 的倍率；或
   - poolBudgetEffectiveDay：number，当日池预算绝对值。
2. agriculture-map.js applyPoolWeatherStep0：优先读 env 注入；无注入时 fallback Demo sandbox random [0.7, 1.3]（与现 standalone 一致）。
3. 主游戏来源（首版可 stub）：GameTime/季节/未来天气系统；暂无可固定 1.0 并 TODO，禁止静默与 Demo 相同 random 冒充生产。
4. loadConfig 若需 fetch agriculture-pool-upgrades.json → AgricultureConfig.setPoolUpgradesTable（若无则 S4 并行）。
5. 单元：test-agriculture-map.mjs 增 case「env.poolWeatherFactor=1.2 → poolCurrent 期望」。

禁止：在 UI roll 天气；禁止改 tick 顺序 §15.0。
验收：注入 0.7 时单 tick 池水上限低于 200；未注入时 test 仍 pass。
```

---

## S3 · UI / 交互补齐（对齐 Demo 可玩性）

### Prompt

```text
你是 UI agent。任务：补齐本体农业面板相对 Demo 的关键交互；视觉与背包/战斗弹窗色调一致。

【农业 Phase 2 · 全局硬约束】
（粘贴 Phase 2 全局约束）

依赖：SceneApp.tryAgricultureAction、getAgricultureMapState*、S2/S4 就绪后水池字段。

必须补齐（相对 agriculture-panel.js 现状）：
1. 选中水池格：等级、上 tick 天气倍率、池水/灌溉预算、蓄水池（L3+）、窃流状态（L2+）— 只读展示；升级按钮走 start_pool_upgrade（S4 提供 buildId）。
2. 选中水渠格：升级/降级 channel（start_build_task buildId channel_upgrade / channel_downgrade，若 build-costs 无则 S4 先补）。
3. 文丘里格：浓度 − / + / range，调用 set_venturi_concentration；等级与可调范围展示同 Demo。
4. 工程暂停：toggle_task_pause action + 底栏按钮；仿真 task.paused 已有则只接线。
5. 格 CSS：tilled 垄沟纹理、作物 growing/ready 伪元素、channel.has-water / algae-bloom、设施格背景（可从 demo CSS 移植到 #modal-agriculture 作用域）。
6. agriculture.msg.fail.*：为常见 reason 补 ui_text，避免 generic。

禁止：document 改 mapState；禁止商店/金钱；禁止复制 runAgricultureMapTick。
验收 PR 描述含 ≥6 条主题对齐点；可玩流程：开面板→渠→文丘里调浓度→关面板等 tick→开收。
低优：11×11 视口 pan/zoom 可不做。
```

---

## S4 · 水池升级 + 渠容量建造表

### Prompt

```text
你是数据 agent。任务：补齐主游戏可用的池/渠升级配置，去掉 Demo 金币升级。

【农业 Phase 2 · 全局硬约束】
（粘贴 Phase 2 全局约束）

交付：
1. data/agriculture-build-costs.json → upgrades.pool_level：1→2、2→3、3→4 各一条（inputs + task_ticks + stamina_per_tick + refund_inputs_on_cancel 按需）。
2. 可选 builds：channel_upgrade、channel_downgrade（inputs 参考 §2.2 容量 ±2；不扣金钱）。
3. js/agriculture-config.js：读取 agriculture-pool-upgrades.json + build-costs upgrades；暴露 getPoolLevelCaps、getPoolUpgradeSpec(fromLv)。
4. scene-app tryAgricultureAction：start_pool_upgrade、窃流配置 pool_theft_set（写 map state.pool_theft，无 DOM）。
5. agriculture-map：tryUpgradePoolLevel(state) 纯逻辑，升 pool_level，不碰 money。

禁止：农业 UI 金币；禁止改 items 大表（属 S6）。
验收：payBuildCost('pool_level_2') 可扣材料；map pool_level 递增；与 pool-upgrades.json 能力一致。
```

---

## S5 · 构建链加固（防脚本断裂类回归）

### Prompt

```text
你是工具 agent。任务：固化 demo → standalone → map 构建，防止脚本/导出断裂。

【农业 Phase 2 · 全局硬约束】
（粘贴 Phase 2 全局约束）

交付：
1. tools/build-agriculture-standalone-html.mjs：构建后除 main script 外，扫描 AgricultureIrrigationDemo 导出对象引用的标识符均存在（或 demo 不再导出 DOM API）。
2. tools/build-agriculture-map-js.mjs：removeNames 与 stripExportBlock 清单与 S1 同步；构建结束跑 test-agriculture-map.mjs（fail 则 exit 1）。
3. package.json script：build:agriculture-all = crops + standalone + map + test。
4. 28 文档脚注：改规则三步命令（demo 改 → build:agriculture-all → 硬刷新 standalone）。

禁止：改仿真公式（除非修构建器抽错）。
验收：故意在 demo 导出写 undefined 符号时构建失败；正常构建后 standalone 打开 grid 121 格。
```

---

## S6 · 物品链收尾（原 A6 续）

### Prompt

```text
你是数据 agent。任务：完成 docs/design/agriculture-a6-items-checklist.md 未勾项。

【农业 Phase 2 · 全局硬约束】
（粘贴 Phase 2 全局约束 + Phase 1 全局约束 inventory 段）

按 checklist A6-1～A6-6 逐条执行并勾选；重点：
- seeds_farming.csv → build-items-json
- isSeedStack 认 farming 子类
- 三档肥 + liquid_seaweed_extract + 八种 soil_amend grants_soil_id
- 藏身处可发放 starter（npc triggers 已有 agriculture_starter_kit 可对齐）

禁止：农业面板商店。
验收：checklist「验收总闸」全 ✓；本体面板 listSeeds/listSoilAmendments 非空（调试档）。
```

---

## S7 · 联调与回归（主程 / 最后一棒）

### Prompt

```text
你是联调 agent。任务：Phase 2 总验收 + 与 Demo 行为对账。

【农业 Phase 2 · 全局硬约束】
（粘贴 Phase 2 全局约束）

清单：
- [ ] npm run build:agriculture-all 通过
- [ ] agriculture-standalone.html：121 格、无控制台 ReferenceError
- [ ] 本体：NPC → 农业面板 → 全流程（无商店）
- [ ] 关面板 tick：作物变、工程不动；开面板：工程推进
- [ ] env 注入 poolWeatherFactor=0.7/1.3 单 tick 池水可观测
- [ ] 池升级 L2 窃流 / L3 蓄水池（S4 完成后）
- [ ] 文丘里浓度 UI 与 §9 主干稀释可观测
- [ ] 收获 N 份 → life_planting +N；背包满不丢 crop
- [ ] 存档/读档设施与作物一致
- [ ] node tools/test-agriculture-save.mjs 通过

输出：差距表剩余项 + 建议优先级（P0/P1）。
```

---

## Phase 2 文件归属速查

| 文件/目录 | 主责 |
|-----------|------|
| `tools/agriculture-irrigation-demo.html` | S1/S5（改规则源头） |
| `tools/build-agriculture-*.mjs` | S5 |
| `js/agriculture-map.js` | S1/S2（仿真） |
| `js/scene-app.js`（env、新 action） | S2/S4 |
| `js/agriculture-panel.js`、`index.html` #modal-agriculture | S3 |
| `data/agriculture-build-costs.json`、`agriculture-pool-upgrades.json` | S4 |
| `data/items/*`、`build-items-json.mjs` | S6 |
| `docs/design/28-*.md` | S0 |
| `tools/test-agriculture-map.mjs`、`test-agriculture-save.mjs` | S1/S2/S7 |
