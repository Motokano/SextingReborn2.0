# 藏身处账号仓库 · 分 Agent Prompt 包

> **用法**：每个任务复制对应 **「Prompt」** 整段给独立 agent。所有 agent 必须先读 **「全局约束」** 与 `docs/design/29-hideout-warehouse.md`。  
> **UI 视觉正本**：`reference/code_artifact.html`（外部设计稿）；主题对齐说明见 `docs/design/hideout-warehouse-ui-agent-prompt.md`。  
> **仓库路径**：`SextingReborn2.0`（Windows 示例：`c:\Users\admin\Desktop\SextingReborn2.0`）。

---

## 执行顺序

```text
W0（文档对齐，可选半天）
  ↓
W1 数据/存档 ║ W2 UI 壳（HTML+CSS，可并行）
  ↓
W3 面板渲染与存取 MVP（依赖 W1+W2）
  ↓
W4 世界入口/NPC ║ W5 扩建子层（并行，依赖 W3 公开 API）
  ↓
W6 腐败/冷藏 tick ║ W8 工料仓扣物（可并行，依赖 W1）
  ↓
W7 QoL 分批（依赖 W5 解锁表 + W3）
  ↓
W9 联调总验收
```

**`scene-app.js` 冲突控制**：

- **W1**：不碰 UI；仅 `hideout-warehouse.js` + `save-system.js` 最小导出。
- **W3**：`js/hideout-warehouse-panel.js` 为主；`scene-app.js` 只加 `loadConfig` fetch、`SceneApp.openHideoutWarehousePanel` / `close` 薄转发、一次 `bindHideoutWarehousePanelOnce`。
- **W4/W5/W7**：优先只调 `HideoutWarehouse` / `HideoutWarehousePanel` API；避免多人同时大改 `renderCombatModal` 等区域。

**脚本顺序（`index.html`）**：`hideout-warehouse.js` → `hideout-warehouse-panel.js` → `save-system.js` 之后、`scene-app.js` 之前（panel 依赖 HW + IE + ItemInfoModules）。

---

## 全局约束（贴进每个 Prompt 开头）

```text
【藏身处账号仓库 · 全局硬约束】
- 规则权威：docs/design/29-hideout-warehouse.md；升级表 data/warehouse-upgrades.json；Agent 规则 .cursor/rules/base-warehouse-agent.mdc。
- 两套仓库禁止混用：
  · 调试仓 modal-base-warehouse：无限从 items 表取 1，不扣库存（过渡期保留）。
  · 账号仓 hideout_warehouse：真库存，存档字段独立，读写唯一入口 js/hideout-warehouse.js（HideoutWarehouse）。
- 限格不限重：存入/取出均不触发角色 W/Wmax 超重判定（05 §5.5.6）。
- 堆叠：模板 stack_limit>1 默认可仓内叠 count；deposit_auto_stack 为开局免费能力。
- 实例：装备/未鉴定/resolved_rolls 等完整实例原样存取。
- 展示：getDisplayName/getDisplayDesc 必须传 character（语言等级规则）。
- 取出放入顺序：背包 → 载具（已绑且未超载）→ 背心 → 口袋；仍满则脚下（05 §5.5.5）。
- 首版开仓：按 29 §4 默认开放（100 格、四容器手动存）；A0 在 warehouse-upgrades.json 中为逻辑占位，运行时默认视为已满足，勿阻断 NPC 开仓。
- 入口：设施 NPC 管线（warehouse_station_interact_npc_* → interactNpc → 主菜单）；非地图常驻按钮。调试仓 annotations「仓库」与真仓并存，文案须区分。
- UI 主题：与 #modal-combat、#modal-backpack 同系列（#2d2d28 / #d3a060 / #ff8c00 / 2px #4d4d45）；禁止 Tailwind CDN、禁止另起配色宇宙。
- 文案：玩家可见字符串一律 data/ui_text_zhCN.json + UIText.t()；新增 key 须同步 applyDom 节点。
- 700 格：UI 必须分页（建议每页 100 格），禁止一次渲染 700 DOM。
- 面板内纯 UI 操作不消耗 tick；扩建工程消耗 task_ticks × stamina_per_tick（对齐农业建造）。
- 死亡：hideout_warehouse 不清；身上四容器按 03-death-and-insurance.md。
- 关游戏：全局 tick 冻结；腐败 elapsed 不补算离线；冷藏 U-G3 整仓冻结 elapsed 递增。
- U-G2 远驿：当次地牢仅存入、禁止取出（按钮 disabled + hint）。
- 禁止：用调试仓逻辑写 hideout_warehouse 存档；禁止农业/烹饪 UI 私写扣仓（须 HideoutWarehouse + AgriculturePlayerItems 枚举）。
```

---

## W0 · 文档与索引对齐（可选）

### Prompt

```text
你是本仓库的文档 agent。任务：冻结藏身处账号仓库实现口径，不写游戏逻辑代码。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

请完成：
1. 核对 docs/design/29-hideout-warehouse.md §4「默认开放」与 §13 验收第 1 条是否矛盾；以 §4 为准修正验收表述（A0 占位默认满足）。
2. 在 docs/design/00-index.md 增加本文件 hideout-warehouse-port-agent-prompts.md 链接。
3. 在 29 §12 实现索引补：reference/code_artifact.html、hideout-warehouse-panel.js、本 prompt 包路径。
4. 输出简短「变更摘要」供主程确认。

禁止：改 js/*、index.html、items.json。
验收：§29 单独阅读可理解开仓/存档/调试仓并存，无与全局约束矛盾句。
```

---

## W1 · 数据层与存档（hideout-warehouse.js）

### Prompt

```text
你是本仓库的实现 agent。任务：建立 hideout_warehouse 运行时 API 与存档，无 DOM。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

交付：
1. 新建 js/hideout-warehouse.js，挂载 window.HideoutWarehouse。
2. 状态形状对齐 29 §10：
   { capacity, slots[], unlocked_qol_ids[], unlocked_upgrade_ids[], settings: { prefer_deduct_warehouse } }
   · slots 长度 === capacity；元素为 null 或完整物品实例（与 IE 物品实例字段一致）。
   · 新档默认：capacity=100（读 warehouse-upgrades.json base_capacity），slots 全 null，unlocked_qol_ids 含 base_free_qol_ids。
3. 对外 API 至少包含：
   · getState / setState / createDefaultState
   · getCapacity / getUsedCount / findEmptySlotIndex
   · getWarehouseStackLimit(tpl) — stack_limit>1 或可覆盖 warehouse_stack_limit
   · canDepositInstance(inst) / depositFromInstance(inst, opts?) — deposit_auto_stack 合并同 item_id
   · depositFromContainer(containerType, index) — 从 IE 取物写入仓
   · withdrawSlot(slotIndex, count?) — 按 05 §5.5.5 放入 IE；返回 { ok, reason?, placed? }
   · hasQoL(qolId) / unlockUpgrade(upgradeId) — 读 warehouse-upgrades.json
   · countItem(itemId) — 全仓计数（供扩建材料对照）
4. js/save-system.js：buildSnapshot / applySnapshot 增加 hideout_warehouse；缺字段迁移为 createDefaultState()。
5. 新建 tools/test-hideout-warehouse.mjs：
   · 叠堆合并、满格拒绝、装备实例往返、withdraw 放入顺序 stub（可 mock IE 最小接口）
   · node tools/test-hideout-warehouse.mjs 必须通过

禁止：document、index.html、scene-app 面板渲染、改 modal-base-warehouse。
禁止：把 hideout_warehouse 塞进 InventoryEquipment.getState()。
验收：测试通过；读档后 slots 与 capacity 一致；deposit_auto_stack 同 id 合并 count。
依赖：可读 data/warehouse-upgrades.json；InventoryEquipment 仅在 deposit/withdraw 时调用。
```

---

## W2 · UI 壳（index.html HTML + CSS）

### Prompt

```text
你是本仓库的前端 agent。任务：把 reference/code_artifact.html 的静态布局移植进 index.html，不接业务数据。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

视觉参照：
- reference/code_artifact.html（三栏 + 底栏四容器 + 扩建 overlay + footer）
- #modal-combat 尺寸与 token（min(1280px,98vw) × min(860px,92vh)、combat-hub-title、combat-cat-btn、combat-pager）
- docs/design/hideout-warehouse-ui-agent-prompt.md §0 色板

交付：
1. index.html 新增 #modal-hideout-warehouse（与 #modal-base-warehouse 并存），结构含固定 id：
   · #hw-close, #hw-capacity-num, #hw-badge-outpost, #hw-badge-frost（默认 hidden）
   · #hw-tab-rail, #hw-slot-grid, #hw-pager, #hw-detail
   · #hw-container-strip（口袋/背心/背包/载具占位容器）
   · #hw-upgrade-overlay（扩建子层，默认 hidden）
   · #hw-footer-hint
2. CSS 全部写在 #modal-hideout-warehouse 作用域下（类名建议 hw-*）；禁止 Tailwind CDN、禁止 Google Fonts 外链（Noto Serif 可复用 index 已有 font-family）。
3. 复刻 reference 的：slot-cell selected/locked、btn-primary/btn-secondary、进度条轨道、滚动条 thumb 渐变。
4. data/ui_text_zhCN.json：补 hideout_warehouse.* 文案 key（标题、容量、按钮、footer、badge、空态）；HTML 用 data-ui="key"。
5. 暂不写 scene-app 逻辑；modal 默认 display:none，与 .show 切换口径同 #modal-combat。

禁止：改 js/hideout-warehouse.js；禁止删除 #modal-base-warehouse。
禁止：在 JS 里大量 style.xxx 内联（样式集中在 index.html CSS）。
验收：浏览器手动给 modal 加 class show 可见完整静态布局；UIText.applyDom 不抛缺 key；与战斗面板并排截图色值一致。
```

---

## W3 · 面板 MVP（渲染 + 存取）

### Prompt

```text
你是本仓库的实现 agent。任务：账号仓库面板可打开、可看格、可选中、可存取（MVP）。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

前置：W1 HideoutWarehouse、W2 #modal-hideout-warehouse DOM 已存在。

交付：
1. 新建 js/hideout-warehouse-panel.js，挂载 window.HideoutWarehousePanel：
   · open / close / isOpen
   · render() — 刷新容量、当前页网格（每页 100 格）、选中详情、底栏四容器迷你格
   · uiState: { page, pageSize:100, selectedSlot, filterTab:'all' }（首版 filterTab 仅 all）
2. 网格格渲染：
   · 空格：斜体「空」#6b6560
   · 有物：缩写名 + ×count；星标/锁/易腐角标预留 class（无 QoL 时可不显示）
   · selected：橙边 + 光晕（同 reference .slot-cell.selected）
3. 详情区 #hw-detail：
   · 名称 + 描述 + ItemInfoModules.renderTooltipModulesHtml（与背包详情同口径，传 character）
   · 按钮：取出至背包（全部 count）、仅取出 1 个；调用 HideoutWarehouse.withdrawSlot
   · 存入：底栏格点击 → depositFromContainer；「整包存入 ↑」按容器类型批量 deposit（能存多少存多少）
4. 分页：复用 .combat-pager / .combat-pager-btn 样式；文案「第 n / m 页 · 每页 100 格」
5. js/scene-app.js 薄胶水：
   · loadConfig fetch data/warehouse-upgrades.json → HideoutWarehouse.setUpgradeTable（W1 需提供）
   · SceneApp.openHideoutWarehousePanel / closeHideoutWarehousePanel
   · bindHideoutWarehousePanelOnce：关闭钮、分页、格点击、取出/存入按钮
   · index.html 引 hideout-warehouse-panel.js
6. 临时调试：SceneApp.openHideoutWarehousePanel() 可从控制台打开（W4 接 NPC 前）。

禁止：实现扩建扣料（属 W5）；禁止改调试仓 modal-base-warehouse。
禁止：详情区恢复 formatItemAttributes 大串（遵守 backpack-panel-modern-agent）。
验收：控制台开仓 → 从 pocket 存入 → 选中 → 取出回背包；容量显示 used/max；700 capacity 时分页正常。
```

---

## W4 · 世界入口与 NPC

### Prompt

```text
你是本仓库的实现 agent。任务：仓库设施 NPC 管线 + 地图绑定，玩家在游戏内可开仓。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

参照：life-workbench-interaction-agent.mdc、npc-dialogue-pools-agent.mdc §5b（灶台/制肥桶同构）。

交付：
1. 地图 data/maps/M0_Base_Inside_lv_1.json（或现有基地图）：
   · annotations 保留原「仓库」调试格（若已有）
   · 新增 warehouse_station_interact_npc_by_cell["x,y"] 指向仓库 NPC
2. NPC 四件套（若不存在则新建）：
   · data/npc/npc_station_warehouse_base.json — mainMenu.showOpenHideoutWarehousePanel: true, tags: ["warehouse_station"]
   · *_triggers.json、*_dialogue_pools.json（可空 pools）
   · data/npc/npc_registry.json 登记 def/triggers/dialogue_pools
3. js/game-engine.js：isWarehouseStationCell / 占格不可走（与 cooking 范例并列）
4. js/scene-app.js tryIntentMove：邻格点仓库设施格 → interactNpc（getInteractNpcIdAt 需识别 warehouse 绑定）
5. js/npc-system.js：主菜单渲染「打开仓库」按钮 → SceneApp.openHideoutWarehousePanel()
6. data/ui_text_zhCN.json：npc 菜单文案 key

禁止：用 annotations「仓库」直开 modal-base-warehouse 冒充真仓（调试入口保留但文案区分）。
禁止：实现 U-G2 地牢远驿（属 W7）。
验收：邻格点仓库 NPC 格 → 对话 → 打开 #modal-hideout-warehouse；与调试 action-bar-warehouse 文案不混淆。
```

---

## W5 · 扩建子层与工程 tick

### Prompt

```text
你是本仓库的实现 agent。任务：仓库面板内「扩建」overlay + 升级节点列表 + 工程推进。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

数据：data/warehouse-upgrades.json（14 节点）；视觉 reference/code_artifact.html #upgrade-panel。

交付：
1. HideoutWarehouse 扩展：
   · active_upgrade_task: null | { upgrade_id, ticks_remaining, ... }
   · getUpgradeStatus(upgradeId) → locked | available | insufficient | completed
   · startUpgrade(upgradeId) — 扣 inputs（人物四容器 + 仓内 scan，优先顺序与现有制作一致）；扣失败则 abort
   · tickConstructionTask() — 每 tick 扣 stamina_per_tick；完成则 unlockUpgrade + 更新 capacity/qol
2. HideoutWarehousePanel：
   · #hw-btn-upgrade 打开 #hw-upgrade-overlay；节点列表 + 右侧确认区（材料 have/need）
   · 进行中：进度条 #d3a060 + 剩余 tick
   · 关闭 overlay 不回滚已扣材料
3. scene-app：**勿**在 world tick 钩子推进仓库扩建；扩建 tick 由 `HideoutWarehousePanel` 在扩建子层打开时用 `setInterval(panel_tick_ms)` 推进（默认 2000ms），并扣体力；关闭子层/面板即暂停。
   · **默认按 29 §6「面板现实计时」**；Implementer 若改口径须同步文档。
4. UI 节点卡状态：已部署 / 可扩建 / 材料不足 / 前置未满足（读 requires + unlocked_upgrade_ids）
5. **路线发现（29 §6.0）**：
   · 新档首次打开 overlay → **三选一**（route_pick.route_starts：U-A1 / U-C1 / U-B1），调用 pickInitialRoute
   · 列表只渲染 listVisibleUpgradeIds()；未发现节点 **完全隐藏**
   · 完工 unlockUpgrade 后 refreshDiscoveriesAfterUnlock（requires 全满足才写入 discovered_upgrade_ids）
   · 存档字段：discovered_upgrade_ids、initial_route_picked、initial_route_id
验收：U-A1 完成后 capacity 200；材料不足时按钮 disabled；completed 节点不可重复扣料。
依赖：W1、W3。
```

---

## W6 · 腐败计时与冷藏（U-G3）

### Prompt

```text
你是本仓库的实现 agent。任务：仓内 spoilage_elapsed_ticks 与 U-G3 整仓冷藏。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

规则：29 §9；物品模板 spoilage_ticks（0=不腐败）。

交付：
1. 实例字段 spoilage_elapsed_ticks（仅 spoilage_ticks>0 的实例）
2. HideoutWarehouse.tickSpoilage() — 每个 world tick：
   · 未解锁 U-G3：仓内可腐实例 elapsed++
   · 已解锁 U-G3：整仓冻结（不递增）
   · elapsed >= spoilage_ticks → 转化失败产物或删除（与项目全局失败物口径对齐；无则 TODO + 日志）
3. 取出到身上：elapsed 保留，继续随全局 tick 递增（取出后不在仓内仍计时）
4. 关游戏再开：不补算离线 tick
5. Panel：Header #hw-badge-frost；易腐格角标「易腐」/「已冻结」；冷藏开启时 badge 显示

禁止：改 items.json 大表（除非补 spoilage_ticks 测试项，走 CSV build）。
验收：无 U-G3 时仓内 elapsed 随 tick 增；U-G3 后冻结；取出后继续增；离线不跳变。
依赖：W1；tick 钩子与 W5 协调避免重复注册。
```

---

## W7 · QoL 分批（解锁驱动）

### Prompt

```text
你是本仓库的实现 agent。任务：按 unlocked_qol_ids 渐进启用 QoL（可分多 PR，本 prompt 为整包说明）。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

对照 warehouse-upgrades.json qol_ids：

| qol_id | 行为 |
|--------|------|
| qol_quick_transfer (U-C1) | 双击仓格/容器格快速存取 1 |
| qol_tidy_one_click (U-B1) | 顶栏「一键理仓」压空+排序 |
| qol_deposit_all / qol_slot_preview (U-C2) | 整包存入 + 占格预览弹窗 |
| qol_tab_views (U-G1) | 左轨 Tab：全部/材料/装备/易腐/已锁定/星标 |
| qol_star_lock (U-E1) | 详情区星标/封签；格角标 ★/🔒 |
| qol_outpost (U-G2) | 地牢态：badge「远驿·仅可存入」；禁用取出 |
| qol_saturated_withdraw (U-C3) | 饱和取出至四容器上限 |
| prefer_deduct_warehouse (U-F2) | ⚙ 设置勾选（W8 消费） |

交付（按优先级实现，未解锁则 UI 隐藏或 disabled）：
1. U-G1 分栏 Tab + 筛选逻辑（读 items 模板 category/tags）
2. U-C1 双击 handlers
3. U-B1 tidySlots() 纯函数 + 按钮
4. U-E1 slot.meta star/locked 存档字段
5. U-G2 viewMode outpost — SceneCtx 或地图 region 判定「当前在地牢」
6. U-C2/U-C3/U-F1/F3 可记 TODO 占位

禁止：未解锁 QoL 却默认全开（须 hasQoL 门控）。
验收：console 或测试档 unlock qol 后对应 UI 才出现；U-G2 地牢内取出按钮 disabled + hint 显示。
依赖：W3、W5（unlocked_qol_ids 来源）。
```

---

## W8 · 工料仓与生产扣物（U-F2）

### Prompt

```text
你是本仓库的实现 agent。任务：设施制作扫描 hideout_warehouse + 可选优先扣仓。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

参照：29 §7、28-agriculture-irrigation.md §16.3、recipe-system 设施制作入口。

交付：
1. js/agriculture-player-items.js（或等价统一枚举）：增加 source hideout_warehouse；list/consume 走 HideoutWarehouse
2. 烹饪/制药/制肥/农业扣料路径：扫描顺序 =
   · prefer_deduct_warehouse===true → 先仓后身上四容器
   · 否则 → 先身上后仓（与 29 默认一致）
3. HideoutWarehouse.consumeItems([{item_id,count}]) — 从仓格扣减，够则 ok
4. 仓库面板 ⚙：勾选写入 settings.prefer_deduct_warehouse（W7 可只做设置持久化，本任务负责被制作系统读取）

禁止：农业面板/烹饪 UI 内手写扣 hideout_warehouse 循环。
验收：勾选优先扣仓后 tryCookAtStation / 农业 payBuildCost 先从仓扣；未勾选则先扣 pocket/backpack。
依赖：W1。
```

---

## W9 · 联调与回归

### Prompt

```text
你是联调 agent。任务：藏身处账号仓库总验收 + 与调试仓并存检查。

【藏身处账号仓库 · 全局硬约束】
（粘贴上文「全局约束」全文）

清单（29 §13 + 本包补充）：
- [ ] node tools/test-hideout-warehouse.mjs 通过
- [ ] NPC 邻格 → 打开 #modal-hideout-warehouse（非 modal-base-warehouse）
- [ ] 100 格默认；deposit_auto_stack 叠堆；装备实例 resolved_rolls/鉴定往返
- [ ] 取出顺序：背包→载具→背心→口袋→脚下
- [ ] 存入不触发超重；取出触发 putItemIntoDefaultContainer 链
- [ ] 分页：capacity=700 时 7 页无卡顿
- [ ] 扩建 U-A1：200 格 + 扣料 + tick 工程
- [ ] 死亡：仓保留、身上清空（03）
- [ ] 存档/读档 hideout_warehouse 一致
- [ ] U-G3 冷藏 / U-G2 远驿（若 W6/W7 已接）
- [ ] U-F2 优先扣仓（若 W8 已接）
- [ ] 调试仓仍可用且文案含「调试/无限取物」类区分
- [ ] getDisplayName/Desc 传 character；ItemInfoModules 详情一致
- [ ] 无 Tailwind CDN；UIText 无缺 key

输出：差距表（P0/P1）+ 建议下一 sprint 项。
```

---

## 文件归属速查

| 文件/目录 | 主责 |
|-----------|------|
| `reference/code_artifact.html` | W2 视觉参照（只读） |
| `docs/design/hideout-warehouse-ui-agent-prompt.md` | W2 主题约束 |
| `docs/design/29-hideout-warehouse.md` | W0、全员 |
| `data/warehouse-upgrades.json` | W1/W5/W7 |
| `js/hideout-warehouse.js` | W1、W5/W6/W8 扩展 |
| `js/hideout-warehouse-panel.js` | W3、W5/W7 UI |
| `js/save-system.js` | W1 |
| `index.html` #modal-hideout-warehouse CSS/HTML | W2 |
| `js/scene-app.js` | W3 薄胶水、W4/W5 tick、W6 |
| `js/npc-system.js`、`data/npc/*`、`data/maps/*` | W4 |
| `js/agriculture-player-items.js`、制作扣料链 | W8 |
| `data/ui_text_zhCN.json` | W2/W4/W7 |
| `tools/test-hideout-warehouse.mjs` | W1、W9 |
| `modal-base-warehouse`（调试） | **勿动逻辑**，W9 确认并存 |

---

## 外部 UI Agent 专用（仅 W2 可转发）

若 agent **无法访问仓库**，只交付静态 HTML：复制 `docs/design/hideout-warehouse-ui-agent-prompt.md` 全文（--- PROMPT 开始 --- 至结束），产出物落盘为 `reference/code_artifact.html` 更新版；**W2 负责**转写进 `index.html`，不接 Tailwind。

---

## 最小 MVP 切片（赶进度时）

仅跑 **W1 → W2 → W3 → W4 → W9 前 6 项** 即可演示「真仓存取 + NPC 入口」；W5～W8 可后续 sprint 并行。
