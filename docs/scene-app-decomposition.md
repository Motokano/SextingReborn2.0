# scene-app 组合根化拆解执行计划

> **性质**：重构执行计划（非玩法设计正本）。目标：把 `js/scene-app.js` 从「12480 行的上帝对象」收敛为「只引用子模块的组合根」。
> **快照日期**：2026 拆解盘点基线。行号与函数/变量清单以 [refactor-scene-app-inventory.md](refactor-scene-app-inventory.md) 为准；随迁移推进更新本文件与清单。
> **原则**：只搬移接线不改行为；每阶段可运行可回归；存档键不变；index.html 加载序规则不变。
> **验收口径（用户拍板 2026-10）**：**结构指标，不以行数为准**——见 §0。

---

## 0. 目标与验收标准（Definition of Done）

拆解完成后，`scene-app.js` 只保留以下职责：

1. **启动与接线**：`init`、`registerUiWindows`、boot 相关 hooks、面板注册。
2. **跨系统门控与编排**：`guardPlayerActionBlocked`、`isStoryMovementLocked`、`guardPlayerComaBlocked`、`patchSurvivalTickForWorldSystemsOnce` 的**调用点**（settle 逻辑本身在各子系统内）。
3. **SceneCtx 定义与转发桥**：`SceneCtx.actions.*` 只做「动作 → 子系统调用」的转发，不再内联实现。
4. **刷新调度**：所有「状态变了去刷 HUD/面板」的直调收敛为 `SceneHud.refresh(kind, payload)` 一个通道（见 P0）。

**验收标准（结构指标，用户拍板）**：

- **① 主 JS 无系统规则/状态逻辑**：站点（config/图鉴/匹配/状态/技能/craft/temp/配件/解锁/原料判定）、敌人世界模拟、物品使用规则、tooltip 渲染均已在模块内；以「scene-app 顶层函数对模块 API 的调用占比 + 闭包无残留系统状态」为核验依据。
- **② 三站点面板 DOM 模块化**：`cooking-station-panel` / `pharmacy-station-panel` / `compost-panel`（DOM 归 panel 模块，消除「面板与场景胶水纠缠主 JS」这一最大结构病灶）。
- **③ 兼容桥与未接线产物清理**：`SceneCtx.updateStatusPanel`、`window.SceneApp.*` 导出袋、`game-state-core.js` / `svelte/` / `trade_*` 归档或删除。
- **④ 农业状态归属**：`AgricultureMap` 自持状态（getState/setState），删 scene-app 镜像。
- **⑤ 卫生**：工作区干净；每阶段启动冒烟通过；执行日志与 00-index 同步；交付用户**完整走一遍无回归**。
- 行数不设硬指标；scene-app 随结构迁移自然收敛（预期 ~5k 上下）。

## 1. 现状基线（2026 盘点快照）

### 1.1 数字

| 指标 | 值 |
|------|-----|
| 总行数 | 12480 |
| 顶层函数（4 空格缩进） | 370 |
| 闭包顶层变量 | 111 |
| scene-app 向 window 的临时出口 | ~20 个（`PlayerFacing`、`HUD`、`setPlayerAvatar*`、`getLimbActionTags` 系列、`ARM/FOOT_ACTION_TAGS`、`COMBAT_LIMB_IDS` 等） |
| 加载位置 | `index.html` 脚本表倒数第二（仅先于 bootstrap/debug-router） |

### 1.2 功能分块（8 块，行号区间为近似边界，精确边界以清单逐函数核对）

| 块 | 近似范围 | 规模 | 内容 | 目标归宿 |
|----|---------|------|------|---------|
| ① 站点系统（制作三站） | ~4590–7900 | ~3300 行 | 烹饪/制药/沤肥的状态、配方结算、配件装卸、方法解锁、三个 240+ 行的面板渲染（`renderCookingStationPanel` 6106、`renderPharmacyStationPanel` 6764、`renderCompostStationPanel` 7579） | 新 `cooking-station.js`/`cooking-station-panel.js`、`pharmacy-station.js`/`pharmacy-station-panel.js`；沤肥状态已在 `CompostSystem`，仅迁 UI → `compost-panel.js` |
| ② 世界 tick 模拟 | ~2876–4470 | ~1600 行 | 采集挂机、烹饪/制药制作推进（`finalizeCookingCraftNow` 3502–3640）、敌方世界实例 tick/击杀/电池掉落/眩晕衰减（`settleEnemyKills` 4109、`tickEnemiesAfterWorldTick` 4270、`tickPlayerStunDecay` 4409） | ①的 craft 部分随站点走；敌人侧 → `combat-world.js`；采集胶水并入既有 `Gathering` |
| ③ 战斗 UI | ~9337–10902 | ~1500 行 | `renderCombatModal`（9731–10225，单函数 500 行拼 HTML）、招式/招架变式选择器、部署战斗 | 新 `combat-ui.js`（战斗结算已模块化，UI 是漏网之鱼） |
| ④ 农业胶水 | ~7896–8720 | ~800 行 | `agricultureMapState` 镜像（7874）、`syncAgricultureMapTickMirror` 4042、面板开合与自动 tick | `AgricultureMap` 改为自持状态；面板胶水并入既有 `AgriculturePanel`；scene-app 删镜像 |
| ⑤ 畜牧胶水 | ~8596–8720 | ~150 行 | `onLivestockAutoTick`、面板开合 | `LivestockState` 已自持状态；胶水并入既有 `LivestockPanel` |
| ⑥ 场景 HUD / 杂项 UI | 散布 ~288–2876 | ~2000+ 行 | `updateStatusPanel`（1768–2227，单函数约 460 行）、tooltip、快捷栏、玩家行动菜单、角色卡/Buff HUD、创角与序章 UI | 新 `scene-hud.js`（状态面板/角色卡/Buff HUD）+ `scene-ui.js`（tooltip/快捷栏/行动菜单） |
| ⑦ 物品使用 | ~12063–12480 | ~400 行 | `applyItemUseEffectFromTemplate`、`tryUseItemFromContainer`、`tryEquipItemFromContainer`、进食经验 | 新 `item-use.js`（`InventoryEquipment` 已 2756 行，不再并入） |
| ⑧ 主 JS 保留 | init 11282–12063、门控/编排、SceneCtx | ~2500 行内 | 启动接线、注册、门控、转发桥、刷新调度 | ✅ 留在 scene-app |

### 1.3 存档模块边界（save-system.js 取证，拆解不得破坏）

快照顶层键：`schemaVersion / saveGeneration / time / player{engine, inventoryEquipment, characterAttributes, survival, gathering, entityAppearance, npcDemo, sceneUi} / agriculture_map / hideout_warehouse / compost / livestock / muscles / buffs`。

- 已有独立 state 模块：`GameTime、GameEngine、CharacterAttributes、Survival、InventoryEquipment、BuffSystem、CompostSystem、HideoutWarehouse、LivestockState、Muscles、Gathering(部分)、NPCSystem(演示态)`。
- 仍内嵌在 scene-app 的证据：`snapshot.player.sceneUi`（含烹饪/制药已学配方 `normalizeSceneUiKnownRecipes`）由 scene-app 闭包维护 —— 站点拆解时必须把该状态迁入站点模块，并在 save-system 保留 `sceneUi.knownRecipes` 兼容读写。

## 2. 目标模块图与 API 契约（草案）

命名沿用现有 kebab-case 与「state / panel」双文件惯例（参照 `livestock-state.js`+`livestock-panel.js`、`agriculture-map.js`+`agriculture-panel.js`）。新模块均在 `js/`，加载序置于 scene-app 之前。

### 2.1 站点三系统（块 ①）

```
js/cooking-station.js        window.CookingStation
js/cooking-station-panel.js  window.CookingStationPanel
js/pharmacy-station.js       window.PharmacyStation
js/pharmacy-station-panel.js window.PharmacyStationPanel
js/compost-panel.js          window.CompostPanel      （状态在既有 CompostSystem）
```

契约（与 `LivestockState` 同型）：

```js
CookingStation = {
  setConfig({ methods, recipes, failureItemId, tempStationLifetimeTicks, unlockFlag }),
  createDefaultState(), getState(), setState(s),           // 存档三件套
  isUnlocked(ctx), tryStart(ctx, inputs, methodId),        // 门控在外部，这里是纯结算入口
  advanceWorldTicks(n), finalizeNow(),                     // 制作推进（自 scene-app 3502/3640 迁入）
  knownRecipes: { get/set },                               // 自 sceneUi 迁入，save-system 兼容层保留
}
CookingStationPanel = {
  open(ctx, { container }), close(), render(),             // 面板 DOM（自 6106–6347 迁入）
  refresh(),                                               // 由 SceneHud 统一调度
}
```

### 2.2 世界模拟（块 ② 敌人侧）

```
js/combat-world.js  window.CombatWorld
```

契约：`CombatWorld.tickWorld(n, ctx)` 内部调用 `tickEnemiesAfterWorldTick` / `settleEnemyKills` / 电池掉落 / `tickPlayerStunDecay`；`CombatWorld.playerStruck(rE, simDry, opts)` 承接 `buildEnemyCounterAtkCtx` 4033 与 `runEnemyAttackOnPlayer` 4336。世界敌人实例仍以地图实体为准（不新建状态源）。

### 2.3 战斗 UI（块 ③）

```
js/combat-ui.js  window.CombatUI
```

契约：`CombatUI.renderModal(ctx)`、`CombatUI.openMovePicker(limbId, opts)`、`CombatUI.openParryVariantPicker(...)`、`CombatUI.deploy(...)`（自 9731–10902 迁入）。UI 事件回调通过 `ctx.actions` 回主 JS，避免反向依赖。

### 2.4 农业 / 畜牧（块 ④⑤）

- `AgricultureMap`：由「纯操作库（state 由调用方持有）」改造为「自持状态模块」——补内部 `state` + `getState/setState/createDefaultState` + `advanceWorldTicks(n)` 包装（其 API 已是无副作用纯函数，加一层壳即可）。scene-app 删除 `agricultureMapState`/`setAgricultureMapState`/`syncAgricultureMapTickMirror`（4041 注释自证 tick 仅镜像世界时间，可直接改由模块内部同步）。
- `AgriculturePanel` / `LivestockPanel`：补齐 `open/close/refresh`（若无），scene-app 只留调用。

### 2.5 场景 HUD / UI（块 ⑥）

```
js/scene-hud.js  window.SceneHud     // updateStatusPanel、角色卡、Buff HUD、时间 HUD
js/scene-ui.js   window.SceneUi      // tooltip、快捷栏、玩家行动菜单、创角/序章面板
```

契约核心（**解耦成败的关键**）：

```js
SceneHud.refresh(kind, payload?)   // kind: 'status'|'limbs'|'buffs'|'quickbar'|'combat'|'all'
```

现状里 `updateStatusPanel` 被全文件上百处直调，任何一块迁出前必须先有该通道，否则搬出去的模块无法刷 HUD。

### 2.6 物品使用（块 ⑦）

```
js/item-use.js  window.ItemUse      // applyItemUseEffectFromTemplate / tryUseItemFromContainer / tryEquipItemFromContainer / 进食经验
```

### 2.7 留在 scene-app（块 ⑧）

`init`、`loadConfig`、`registerUiWindows`/窗口菜单、`SceneCtx`（含 `SceneCtx.actions` 转发、`pushDirtyCell`）、门控函数族、序章/创角**启动时序**、`patchSurvivalTickForWorldSystemsOnce` 的调用点（settle 函数迁走后该 patch 退化为「依次调子系统的 advanceWorldTicks」一行编排）。

## 3. 闭包状态归属要点（111 变量，切片时以清单核对引用）

| 归属 | 代表性变量（行号） |
|------|--------------------|
| 随站点走 | `cookingMethods/Recipes` 13-14、`pharmacyMethods/Recipes` 18-19、站点常量 11-12/16/21-25、craft 计时器与 recipe system 常量 3295-3306、烹饪技能常量 4457-4459、`DEFAULT_*_INSTALLED_ACCESSORIES` 3305/4588、三站点面板态 5847-5848/6521-6522/7153-7163（沤肥的 7154-7157 随 `CompostPanel`） |
| 随世界模拟走 | `enemyCounterAttackFlags` 4090；挂机计时器 73-76/3295-3296 随对应子系统 |
| 随战斗 UI 走 | `combatPanelOpen/combatUIState` 9178-9179、`attrExpDebugToggle/stunDbgBtn` 10622-10661（调试按钮归 combat-ui） |
| 随 HUD/UI 走 | `tooltipEl/HideTimer` 580-581、`playerSpriteUrls/currentFacing*` 427-429、`limbActionTags` 573、行动菜单 1291-1292、快捷栏 1298、`backpackPanelOpen/UIState` 5219-5220、面板常量 9239-9247 |
| 随物品使用走 | `lastFoodExpGrantText` 12182 |
| **留主 JS（共享/常量/全局态）** | `E/G/IE/CELL_PX/CENTER_*` 3-8、`idleTickMs` 10、`timeHudVisible` 78、`EQUIP_SLOT_*/BODY_PART_*/COMBAT_LIMB_IDS` 561-572、`CREATION_*` 910-916、`ACTION_TYPES` 2833、`uiWindowsMenuOpen` 11166 |

> 注意 ①：`updateStatusPanel` 被全文件引用 → 属「刷新通道」先行问题，不随块归属。
> 注意 ②：`agricultureMapState` 7874 是镜像冗余，直接删除而非搬移。
> 注意 ③：111 变量清单只列「每行首名」，切片时对复合声明行（如 `var a, b;`）须读源码确认。

## 4. 迁移顺序（每阶段可运行、可回归）

> 每阶段两小步：**先纯搬移 + window 兼容桥（行为零变）→ 再行为整理（删桥、删镜像）**。不得一步到位「边搬边改」。

### 4.0 前置闸门 G0（硬性，不满足不得开始）

- **工作区必须为干净基线**：`js/scene-app.js` 及其余被拆文件无未提交改动（含特性分支半成品）。脏树上切片会令特性工作与重构混于同一文件、无法独立回滚/审查。
- **基线变更后重生成盘点**：inventory 行号取自当前工作区；stash / 提交 / rebase 后行号会漂移，P0 开始前须重新生成 `refactor-scene-app-inventory.md`（文件尾附命令）。
- **分支策略**：重构单独开分支（如 `refactor/scene-app-composition-root`），与特性分支隔离；每阶段一个提交，diff 以「纯搬移」为主可审。

| 阶段 | 内容 | 验收 |
|------|------|------|
| **P0 预置** | 建 `SceneHud.refresh` 刷新通道（先把 `updateStatusPanel` 等直调点登记为 refresh 分发）；为每个待拆子系统在 scene-app 外建 state 壳并桥接（复制变量到模块 + `getState/setState` 直通），存读档键不变 | 新旧档读写一致；HUD 行为无感 |
| **P1 站点三系统**（最大块 ~3300 行） | cooking/pharmacy 状态+面板出主 JS；compost 面板出；`sceneUi.knownRecipes` 迁入站点模块并留 save-system 兼容层 | 制作→存档→读档→继续制作；配件装卸；三面板渲染一致 |
| **P2 世界模拟**（~1600 行） | craft 推进随 P1 完成；敌人世界 tick/击杀/电池/眩晕迁 `CombatWorld`；采集胶水并入 `Gathering` | 战斗一场、杀敌掉落、眩晕衰减日志一致 |
| **P3 农业/畜牧胶水**（~950 行） | `AgricultureMap` 自持状态；删 `agricultureMapState` 镜像；面板胶水并入 `AgriculturePanel`/`LivestockPanel` | 农业自动 tick 与存档、畜牧 tick 一致 |
| **P4 战斗 UI**（~1500 行） | `renderCombatModal`/选择器/部署迁 `combat-ui.js` | 战斗演出/选招/选变式一致 |
| **P5 场景 HUD/UI**（~2000 行） | 状态面板、角色卡、Buff HUD → `scene-hud.js`；tooltip/快捷栏/行动菜单 → `scene-ui.js`；创角/序章 UI 视需要 | 全 HUD 刷新一致 |
| **P6 收尾** | 物品使用迁出（~400 行）；删全部兼容桥与 window 临时出口；规模与重复出口审计；更新本文档、inventory 清单、00-index、14/17 文档中的函数位置标注 | scene-app < 2500 行；`window.scene-app` 临时出口归零 |

**回归手段**：① `save-system.js` schemaVersion 键结构不变（读旧档即回归测试）；② 现有 `tools/smoke-*.mjs` 模式为每阶段补一条冒烟（如「新档→制作→存读档→战斗→农业自动 tick」链）；③ 手动冒烟清单逐阶段勾选；④ 拆解提交用 git diff 可审查为「纯搬移」优先。

### 执行日志

- **P0-批次1（已提交）**：`SceneHud` 刷新通道上线。
  - 新增 `js/scene-hud.js`（register/unregister/refresh 透传参数；未注册 kind 静默 no-op）；`index.html` 挂载于 scene-app 之前。
  - `init()` 顶部注册 `SceneHud.register('status', updateStatusPanel)`。
  - `scene-app.js` 内 **50 处裸调 `updateStatusPanel()` → `SceneHud.refresh('status')`**（±1:1 纯替换，定义与 `SceneCtx.updateStatusPanel` 兼容桥未动）。
  - 外部调用方（buff-system/npc-system/scene-renderer/scene-systems 共 9 处，经 `SceneCtx.updateStatusPanel`，其中 scene-renderer 传 `gatherState`）**暂走兼容桥**，随各自切片迁出时再切 `SceneHud.refresh('status', ...)`。
  - 冒烟：本地实机启动正常（无 BOOT FAILED，场景进入）；无头浏览器无法点击持续动画页（actionability 超时），交互路径待人工在已开的游戏页确认。
- **P0-批次2（决定：跳过批量迁移）**：`updateBackpackPanel`（40 裸调）等其余刷新点留在 scene-app 内时直调无害，留待各自切片迁出时顺手切 `SceneHud.refresh('backpack')`，减少无谓 churn。
- **P1a（已提交）**：物品栏纯读 helper 外移（站点切片地基）。
  - 依赖实测：站点切片候选 = 68 函数、外部闭包依赖 88 个，其中 `getInventoryCountByItemId`(18 处引用) 等**纯读 IE 状态**的 helper 是切站点的前置瓶颈。
  - 新增 `js/inventory-helpers.js`（window.InventoryHelpers）：`findFirstContainerSlotByItemId` / `getInventoryContainerArray` / `getInventoryCountByItemId` 自 scene-app 原样迁出（行为零变，只读 IE/HideoutWarehouse）。
  - scene-app 删除 3 个本地定义，24 处引用 ±1:1 重接 `InventoryHelpers.*`；`index.html` 挂载于 scene-hud 之前。
  - 冒烟：本地实机启动正常，页面状态与改动前一致。
- **P1b（侦察完成，待实现）**：站点 config/数据持有与 craft 运行时迁 `cooking-station.js` / `pharmacy-station.js`。
  - **侦察结论（利好）**：站点运行时状态**本就不在 scene-app 闭包**，而是挂在 `window.SceneCtx` 上：`cooking_station_runtime`（fuel/water/accessories/`active_craft`）、`pharmacy_station_runtime`、`cooking_temp_stations_runtime`、`known_cooking_recipes`/`known_pharmacy_recipes`/`known_recipe_ids_by_system`（图鉴，迁移期双写）。
  - **持久化契约已外置**：save-system（`buildSnapshot` §sceneUi，行 ~352-424）**直接读 `SceneCtx` 字段**（含 `active_craft.station_ref`、temp station 数组、`deriveKnownCookingRecipeIds(SceneCtx)`、`agriculture_unlocked`），不依赖 scene-app 函数 → **状态位置不变 = 存档零风险**，切片只搬"触碰这些字段的代码"。
  - 唯一仍在闭包的状态：config 持有（`cookingMethods/Recipes`、`pharmacyMethods/Recipes`、failure item，`loadConfig` 768-773 装载）与 craft idle 计时器（`setInterval`，属场景胶水，留 scene-app 或由模块暴露 start/stop）。
  - **P1b 具体方案**：新增 `cooking-station.js`/`pharmacy-station.js`，提供 `setConfig(cfg)`（loadConfig 改一行委托）、`getState()` = 透传 `SceneCtx.*_station_runtime`、`advanceWorldTicks(n)` 等纯函数接口；先搬 config 装载 + craft 推进/finalize 逻辑族（`finalizeCookingCraftNow` 等，依赖 analyzer 清单），UI 面板与 infra 桥（ui/showMsg/render/tooltip 系列）留 P1c 一并处理。
  - **P1b-1（已提交）**：config 所有权外移（本切片唯一仍在闭包的站点状态已清）。
    - 新增 `js/cooking-station.js` / `js/pharmacy-station.js`：`setConfig` + `getMethods/getRecipes/getFailureItemId`（cooking 另有 `getTempStationLifetimeTicks`）；内部默认值与旧闭包一致。
    - scene-app：删除 6 个 config 闭包变量声明（cookingMethods/Recipes、pharmacyMethods/Recipes、两个 failure id、tempStationLifetimeTicks）；`loadConfig` 改调 `CookingStation.setConfig(...)` / `PharmacyStation.setConfig(...)`（对齐 `EnemyDrops.setConfig` 惯例）；63 处读取点改走模块 getter（机械替换，零残留）。
    - `index.html` 挂载两模块（scene-app 之前）。
    - 冒烟：实机启动正常（loadConfig 委托在启动期执行成功，无 BOOT FAILED）。
  - **P1b-2（已提交）**：图鉴/known-recipes 小簇外移。
    - 两模块新增 `recipeSystemId`（唯一事实源，替代 scene-app 闭包 `COOKING_RECIPE_SYSTEM`/`PHARMACY_RECIPE_SYSTEM`）与 `markRecipeKnown(recipeId)`（原样迁移 markCookingRecipeKnown/markPharmacyRecipeKnown：双写 `SceneCtx.known_*_recipes` 与 `known_recipe_ids_by_system[recipeSystemId]`）。
    - scene-app：删两个 mark 函数与两个常量声明；2 处调用改走 `CookingStation/PharmacyStation.markRecipeKnown`；2 处 `RecipeSystem.craft({ recipe_system })` 注册参数改读模块 `recipeSystemId`。
    - 冒烟：实机启动正常。
  - **P1b-3（已提交）**：配方匹配簇整体迁 `js/station-craft-core.js`。
    - 词边界依赖普查证明簇近乎自包含（仅 IE/InventoryHelpers + 模块 config getter），且函数体已是模块感知（读 `CookingStation/PharmacyStation.getRecipes()`）。
    - 新模块容纳 12 函数（normalize×2/toCountMap/recipeInputsSatisfiedBySelected/match×2/pick×2/consumeInventoryItemsByList/putItemsBack/toUnified×2）逐字搬移，模块内互引自洽零改写；`putItemsBack`/`consumeInventoryItemsByList` 为烹饪/制药/沤肥三方共享（沤肥调用见原 8810-8850）。
    - scene-app 删 207 行定义；34 处调用改走 `StationCraftCore.*`；语法 + 实机冒烟通过。
  - **P1b-4 / P1c（待办）**：站点规则余部（`getCookingStationState`/`getPharmacyStationState` 访问器、craft 生命周期 finalize/tick、temp station 运行时、`tryCookAtStation` 等）与面板 DOM 迁出；前置 = infra 桥（ui/showMsg/render/updateBackpackPanel 等，见 P1 依赖实测）。
  - **P1c-1（已提交 86a1a06）**：站点运行时状态访问器迁模块。
    - 两站模块新增 `createDefaultState` / `getState`（原 getXxxStationState 逐字迁移：SceneCtx 懒初始化 + fuel/water/water_unlimited/accessories/active_craft 归一化）。
    - scene-app 删 55 行访问器定义；`resetCookingStateForNewCharacter` 改调模块工厂；28 处调用改走 `CookingStation/PharmacyStation.getState()`。
  - **P1c-2（DI 基座已落地，待搬移）**：UI 依赖注入基座——两站模块新增 `setUiDeps(deps)`（deps: ui/showMsg/render/getItemDisplayNameSafe/markCellDirty），scene-app init 注入一次（避免把闭包 infra 塞进 window）；后续 craft 生命周期/面板搬移时函数体改走 deps.ui/showMsg。
  - **策略定案（2026 拆解）**：闭包 infra（ui/showMsg/render/tooltip 系列）不随迁，统一经「模块 setUiDeps(DI)」注入；面板 DOM 仍以「面板模块 + SceneHud.refresh 通道」为目标，P1c 其余子刀逐批执行。
  - **P1c-2b（已提交）**：统一配方路由解析簇迁出（route resolvers 依赖最轻）。
    - `CookingStation.tryResolveCookingByUnifiedRoute` / `PharmacyStation.tryResolvePharmacyByUnifiedRoute`（走 RecipeSystem.craft + 经 DI 触发处理器注册）；`PharmacyStation.getPharmacyMethodDisplayName`（UIText 兜底）；`StationCraftCore.readMethodCostValue`（工艺成本读取，通用）。
    - DI 增键 registerCookingProcessor/registerPharmacyProcessor（scene-app init 注入闭包注册函数）；setUiDeps 改为合并语义。
    - scene-app 删 68 行；11 处调用重接；语法 + 实机冒烟通过。scene-app 当前 12076 行。
  - **P2a（已提交）**：敌人世界模拟整体迁 `js/combat-world.js`（CombatWorld）。
    - 迁出 8 函数（buildEnemyCounterAtkCtx/findEnemyInstanceIndex/settleEnemyKills/settleEnemyBatteryDrops/enemyCounterAttackFlagKey/tickEnemiesAfterWorldTick/runEnemyAttackOnPlayer/tickPlayerStunDecay）+ 反击去重标记状态 `enemyCounterAttackFlags`（模块自持，tick 内快照消费后清空；scene-app 战斗动作侧写入改走 `CombatWorld.markCounterAttackFlag(key)`）。
    - 依赖注入：setUiDeps({ ui, getWorldTotalTicks })（scene-app init 注册）；E/IE = window 别名语义不变。
    - scene-app 删 339 行（含注释）；外部调用 13 处重接 + 3 处 flag 写入改造；语法 + 实机冒烟通过。scene-app 当前 11744 行。
  - **P6a（已提交）**：物品使用规则核心迁 `js/item-use.js`（ItemUse）。
    - 迁出 5 函数（applyFoodDigestBuffFromTemplate/toBoolFlag/itemTemplateIsConsumable/applyItemUseEffectFromTemplate/grantFoodAttributeExp）+ 进食经验反馈通道 `lastFoodExpGrantText`（模块自持，容器使用入口读后清 → `ItemUse.takeLastFoodExpGrantText()`）。
    - 依赖注入 setUiDeps({ ui })；scene-app 删 166 行；外部 3 处重接 + 通道 1 处改造；零残留；语法 + 实机冒烟通过。scene-app 当前 11582 行。
  - **P5a（已提交）**：物品 tooltip 簇迁 `js/scene-ui.js`（SceneUi）。
    - 迁出 6 函数（showItemTooltip/hideItemTooltip + tooltipEl/tooltipHideTimer DOM 态、buildItemTooltipHtml/ForTemplate、formatItemAttributes、buildItemFieldRulesHtmlAppend）。
    - DI setUiDeps({ ui })；scene-app 删 107 行；35 处调用重接；零残留；实机冒烟通过。scene-app 当前 11478 行。本模块是 P5 scene-ui 种子，后续面板/HUD 的 tooltip 依赖已可外部解析。
  - **P1c-2c（已提交）**：烹饪技能熟练度簇迁 `cooking-station.js`。
    - 迁出 3 常量（COOKING_SKILL_MAX_LEVEL/COOKING_MAX_PROFICIENCY_USES/COOKING_SUCCESS_BONUS_PER_LEVEL）+ 4 函数（getCookingSkillLevel/getCookingLevelBySuccessUses/ensureLifeCookingSkillEntry/addCookingSuccessProficiency）；`recalcCharacterStatsFromIE` 经 DI（stationUiDeps 增 recalcCharacterStats 键）。
    - scene-app 删 68 行（保 recalc 与畜牧簇不动）；5 处引用重接；零残留；实机冒烟通过。scene-app 当前 11411 行——craft 生命周期（finalize/tick）的主要闭包依赖已入模块。
  - **P1c-2d（已提交）**：craft 生命周期迁站模块（finalize/tick/active 访问器，340 行移出）。
    - `CookingStation`/`PharmacyStation` 各收 getActiveCraft/clearActiveCraft/finalizeCraftNow/tickCraftAfterWorldTick（原 finalize*CraftNow/tick*AfterWorldTick 逐字迁移，updateBackpackPanel 直调改走 `SceneHud.refresh('backpack')`）；`StationCraftCore` 收 getProductionSuccessRateWithMoodDelta（两站共享）。
    - DI 增键：stopCookingIdle/stopPharmacyIdle/refreshCookingPanel/refreshPharmacyPanel；init 注册 SceneHud kind 'backpack'。
    - scene-app 删 340 行；外部调用重接；零残留；实机冒烟通过。scene-app 当前 11080 行——烹饪/制药制作结算与推进已完全模块化。
  - **P1c-2e（已提交）**：临时灶台运行时迁 `cooking-station.js`（175 行移出）。
    - 迁出 10 函数（normalize/getCookingTempStationsRuntime/isEntity/find/upsert/remove/sync/place/isActiveCraftOnTempStation/tick 到期清理）+ `COOKING_TEMP_STATION_ENTITY_ID` 常量（原 4 处引用全在簇内）。
    - markCellDirty/getMapsRef 为通用小包装留主 JS；模块内直调 SceneCtx.pushDirtyCell/GameEngine.getMaps。
    - scene-app 删 175 行；8 名称重接零残留；实机冒烟通过。scene-app 当前 10905 行。
  - **P1c-2f（已提交）**：站点规则簇迁出（配件装卸/解锁/原料判定，263 行移出）。
    - `StationCraftCore` 收 6 通用项（getItemTemplateSafe/hasItemById/getItemWaterPoints/getItemFuelPoints/isItemAllowedCookingIngredient/isItemAllowedPharmacyIngredient）。
    - `CookingStation`/`PharmacyStation` 各收 5 配件/解锁函数（ids 收集/候选/安装/卸载/isXMethodUnlockedAtStation——临时灶台 allowed_methods 与配件双路校验）。
    - DI 增 getCurrentCookingStationContext/getCurrentPharmacyStationContext 键；修复原 pharmacy options 引用未定义 ids 收集器的潜伏死路径（模块内补齐）。
    - 删除前先扫残留定义（流程固化）；scene-app 删 263 行、26 处重接零残留。scene-app 当前 10597 行。
  - **②-准备刀（已提交）**：站点上下文簇迁 `js/station-context.js`（StationContext，257 行移出）。
    - 迁出 21 函数（forEachAdjacentCell/注解判定×4/上下文探测×4/修复门控族/格位谓词）+ 2 解锁 flag 常量（COOKING/PHARMACY_BASE_STATION_UNLOCK_FLAG）。
    - 面板与交互所需的站点探测全部外部可解析 → 为三站点面板模块化铺路。
    - 逐函数精确删除 + 先扫残留定义；token 重接 30 处；DI 对象键名二次修复（改字符串键）；实机冒烟通过。scene-app 当前 10340 行。
  - **③（已提交）**：兼容桥与探索产物清理。
    - ③-1 `3a338f8`：删 `SceneCtx.updateStatusPanel` 桥——buff-system×2/npc-system/scene-systems/scene-renderer 全改走 `SceneHud.refresh('status')`（scene-renderer 带 gatherState 透传）；顺带修复 5999 行静默坏点（`SceneCtx.SceneHud.refresh` 笔误）。
    - ③-2 `e7e7762`：未接线探索产物归档 `_archive-js/`（game-state-core.js、svelte/dialogue、trade_*，git rename 保历史 + README）；删 `SceneApp.placeTempCookingStationAtPlayer` 死包装；serve-live 监听表去 svelte。导出袋审计：多数 SceneApp/SceneCtx 导出为真实公共 API（save-system/渲染/战斗在用），非债务。
  - **④（已提交）**：农业状态归属 — `AgricultureMap` 自持状态。
    - agriculture-map.js 收 ownedState + ensureState/getState/setState/cloneState/mirrorStateTick（state.tick 仅世界时间镜像语义保留；同步写 SceneCtx.agriculture_map_state 存档通道）。
    - scene-app 删 closure `agricultureMapState`、5 访问器辅助与 syncAgricultureMapTickMirror；6 处调用改走模块；SceneApp.getAgricultureMapState* 导出改模块包装。
    - 零残留、实机冒烟通过。scene-app 当前 10301 行。
- **P1c（待办）**：站点规则与面板迁出（配 infra 桥，见 P1 实测 deps：ui/showMsg/render/tooltip 系列/`isPreCreationGameplayRestricted` 等）；compost 面板 → `compost-panel.js`。

## 5. 风险与对策

| 风险 | 对策 |
|------|------|
| 在工作区脏（特性分支半成品未提交）时启动切片 | **G0 闸门**：先 stash 或提交特性工作，基线干净才允许 P0；重构单独开分支 |
| 闭包隐式共享：迁出的函数引用仍留在 scene-app 的变量/函数 | 每块迁移前用 inventory 清单 grep 引用集，画「迁出引用闭包」闭合后再搬；shared 常量提为 `SceneCtx.constants` 或模块常量 |
| `updateStatusPanel` 等被全文件调用 | P0 刷新通道先行，任何模块不直调 HUD 函数 |
| 存档兼容破坏 | schemaVersion 只增不改；`sceneUi` 键保留兼容读写层 |
| index.html 加载序错位 | 新模块一律置于 scene-app 之前；拆完审计脚本表（可加启动自检：模块声明依赖全局名，bootstrap 统一校验） |
| 行为回归难察觉 | 每阶段小步两段式（搬移→整理）+ 冒烟 + 手动清单 |
| 设计文档引用旧函数位置（14/17 等写了 `js/scene-app.js` 内函数名） | P6 统一更新文档中的接线标注，避免「文档-代码脱钩」复发 |

## 6. 相关文档联动

- 本文件配套底稿：[refactor-scene-app-inventory.md](refactor-scene-app-inventory.md)（函数/变量行号清单，切片核对用）。
- 索引登记：`docs/design/00-index.md` §二·C 执行清单。
- 启动/解耦约定：`docs/design/17-loading-and-decoupling.md`（拆解后其"扩展约定"新增模块应先走本计划模块化路径）。
- 存档约定：`docs/design/14-implementation.md` 存档节（键结构不变原则）。
- 并行探索产物（`js/core/game-state-core.js`、`svelte/`、`trade_*`）不在本计划范围；建议单独归档处理，避免与本次拆解混淆。
