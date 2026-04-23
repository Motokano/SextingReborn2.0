# 堆肥设施 UI 映射表（原型 -> 正式实现）

| 原型元素（`reference/compost_ui.html`） | 正式模块 / 函数 | 说明 |
|---|---|---|
| 顶部双 Tab（好氧/厌氧） | `#compost-tab-aerobic` / `#compost-tab-anaerobic` + `compostStationUiState.mode` | 统一设施内切换批次视图，不复制 demo 时钟。 |
| 左栏“当前投入物料” | `#compost-input-list` + `renderCompostStationPanel()` | 发酵中显示批次锁定材料，空闲时显示暂存投料。 |
| 左栏“背包点击投入” | `#compost-ingredient-list` + `renderCompostIngredientPickerList()` / `tryAddOneCompostInputFromInventory()` | 复用游戏背包数据与物品模板，不走 demo 虚拟材料。 |
| 左栏“感知反馈” | `#compost-perception-text` + `getCompostPerceptionText()` | 仅展示盲投反馈文案，不显示实时 C/N 数值。 |
| 中栏“发酵状态/进度条” | `#compost-progress-kv` + `CompostSystem.getBatch()` | 用真实批次字段（`status/age_ticks/duration_ticks`）渲染。 |
| 中栏“交互窗口提示与动作” | `#compost-window-text` + `interactWithWindow()` | 使用 `CompostSystem.interact()` 处理窗口操作。 |
| 中栏“系统日志” | `#compost-log-list` + `pushCompostLog()` | 设施内日志显示，熟练度维持调试可见口径。 |
| 右栏“结算产出” | `#compost-result-list` + `CompostSystem.collect()` / `discard()` | 对接正式结算与收取，不复制 demo 随机文案逻辑。 |
| 底部“确认发酵/强行终止” | `#compost-start-btn` / `#compost-stop-btn` + `CompostSystem.startBatch()` / `forceTerminate()` | 与正式系统 API 对接，避免并行状态机。 |
