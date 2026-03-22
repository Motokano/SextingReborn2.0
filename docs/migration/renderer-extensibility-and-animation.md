# Renderer 可扩展与动画接入约定

## 目标

- 渲染核心稳定：地图底层与交互不被动画代码污染。
- 动画可独立迭代：动画人员只实现效果层，不改战斗/移动逻辑。
- 性能可控：静态层缓存 + 动态层脏区 + 特效层独立刷新。

## 当前分层

- `static canvas`：地块底图（阻挡、传送、采集点等）
- `dynamic canvas`：玩家/NPC/敌人/地面物品/邻接提示
- `fx canvas`：动画与临时视觉效果（飘字、刀光、命中闪烁）

## TileRendererV2 扩展接口

- `setEffectsRenderer(fn)`  
  注入特效绘制器。`fn` 接收：
  - `ctx`: 特效层 2D context
  - `nowMs`: 当前时间戳
  - `map`: 当前地图对象
  - `state`: 当前玩家坐标状态
  - `cellPx`: 单格像素
  - `cellToPx(x, y)`: 格坐标转像素坐标

- `startAnimationLoop()` / `stopAnimationLoop()`  
  控制特效层动画循环；地图静态/动态层仍按业务 render 节奏。

- `renderFxLayer(nowMs?)`  
  手动触发一帧特效渲染（适合调试或录像回放）。

## SceneAnimation 约定（供动画人员）

若存在全局对象 `window.SceneAnimation` 且实现 `render(fxCtx)`：

- `scene-renderer` 会自动桥接到 `TileRendererV2.setEffectsRenderer`
- 并自动启动特效循环

推荐动画模块 API：

- `SceneAnimation.render({ ctx, nowMs, map, state, cellPx, cellToPx })`
- `SceneAnimation.spawn(effect)`：投递一次性效果
- `SceneAnimation.clear()`：清空全部效果
- `SceneAnimation.setDebugEnabled(boolean)`：显示/隐藏 FX 调试信息
- `SceneAnimation.registerPrefab(id, def)`：注册效果预制体
- `SceneAnimation.spawnPrefab(id, params)`：基于预制体投放效果
- `SceneAnimation.startRecording()/stopRecording()/replay(log, opts)`：事件录制回放
- `SceneAnimation.setRateLimitWindowMs(ms)`：设置事件到特效触发限流窗口
- `SceneAnimation.setMaxActiveEffects(n)`：限制同屏特效上限

## 动画实现建议

- 效果数据结构保持纯数据（开始时间、持续时长、插值参数）
- 每帧只读状态，不在渲染器里改游戏逻辑
- 尽量按格坐标驱动（便于摄像机与分辨率适配）
- 任何动画异常都要吞掉并降级，不影响主渲染

## 后续建议

- 把 `SceneAnimation` 从全局迁移到模块注入（便于单元测试）
- 为常见效果建立 prefab（击中闪光、地面高亮、路径箭头）
- 增加 debug 面板：当前活跃效果数、fx 帧耗时

## 已内置样板效果

- `hit_flash`：命中闪光
- `projectile_trail`：起点到终点的弹道拖尾
- `floating_text`：伤害/提示飘字

内置事件映射：

- `combat:attack` -> 触发命中闪；若包含 `fromX/fromY` 同时触发弹道拖尾；若包含 `damageText` 同时触发飘字
- `move:step` -> 触发轻量位移残影闪
