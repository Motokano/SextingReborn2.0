# React -> Svelte 状态层抽离（第一阶段）

## 现状分析（按模块）

- `js/dialogue-react-view.js`
  - 仅是对话 UI 视图层，使用 `React.useState/useEffect` 管理头像显示与按钮渲染。
  - 不承载游戏核心状态（HP/坐标/回合）。
- `js/game-engine.js`
  - 承载地图与坐标状态：`mapId/x/y`、`moveTo`、传送门切图、可走格判定。
  - 混入了对 `global.Survival.advanceTick()` 的直接调用（逻辑耦合点）。
- `js/survival.js`
  - 承载生存与 tick 逻辑：体力/精力/饱食等及 `advanceTick()`。
  - 目前未显式维护 `HP`，更偏向生存资源。
- `js/scene-app.js` + `js/scene-systems.js`
  - 输入意图路由（移动/攻击/NPC交互）和 UI 事件绑定。
  - 业务流程与 DOM/全局模块耦合较深。

## 抽离目标

为 Svelte 迁移提供「无框架依赖」状态核心：

1. 只保留纯数据与纯函数/类；
2. 输入动作输出结果（可测试、可复现）；
3. UI（React/Svelte/Canvas）只订阅与分发动作，不直接存业务状态。

## 本次新增核心模块

- 文件：`js/core/game-state-core.js`
- 导出 API（UMD）：
  - `createMapState(options)`
  - `createVitalsState(options)`（包含 HP/体力/精力）
  - `createTurnState(options)`（回合/执行者队列）
  - `createGameStateCore(options)`（组合态 + 动作入口）

## 状态映射建议

- 坐标状态：
  - 旧：`GameEngine.getState().mapId/x/y`
  - 新：`core.map.getState().mapId/x/y`
- 生存/HP：
  - 旧：`Survival.getState().stamina/energy/...`
  - 新：`core.vitals.getState().hp/stamina/energy/...`
- 回合：
  - 旧：分散在 `advanceTick` 与输入流程中（隐式）
  - 新：`core.turn.getState().turn/tick/actor`（显式）

## Svelte 接入方式（建议）

1. 在 Svelte 的 store 中持有 `createGameStateCore(...)` 实例；
2. 所有 UI 事件只调用 `core.actions.move/attack/wait`；
3. 调用后用 `core.getState()` 回写到 Svelte store；
4. DOM 只渲染状态，不参与规则判断。

## 下一步（第二阶段）

- 将 `js/game-engine.js` 与 `js/survival.js` 改为 `game-state-core` 的适配器层；
- 把 `scene-app` 的 `tryIntentMove` 决策迁移为纯函数；
- 增加无 UI 单测：移动阻挡、传送门、体力不足攻击失败、回合推进顺序。
