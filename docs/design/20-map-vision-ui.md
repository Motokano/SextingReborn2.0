# 地图视野 UI（仅显示）

## 1. 边界

- **仅影响**：地图 Canvas 渲染、格子符号、悬停 `title` 提示；配置在 `data/survival-config.json`。
- **不影响**：战斗结算、命中、属性、敌人 AI、地图可走规则（点击邻格仍由 `GameEngine` 判定）。
- **实现索引**：`js/scene-renderer.js`（视野剖分、FX 叠加）、`js/core/tile-renderer-v2.js`（分层绘制）。

## 2. 配置块（单一数据源）

| 键 | 说明 |
|----|------|
| `vision_day_night` | 昼夜夜色遮罩 + 玩家周围径向「挖洞」；与朝向无关。 |
| `vision_reveal_ui` | 按距离的 `visual` / `identify` / `detail` 半径（随昼夜插值）；`adjacent_detail_radius` 邻格保底。 |
| `vision_facing_ui` | 是否启用朝向倍率（前/侧/背缩放有效半径）；可选扇形装饰层。 |
| `vision_occlusion_ui` | **朝向视野开启时**生效：对「当前不可视」格子叠加热区遮挡；**身后邻格三元组**例外（见 §3）。 |

### 2.1 `vision_occlusion_ui` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | bool | 总开关；且需 `vision_facing_ui.enabled === true`，否则无「背后」语义。 |
| `hide_nonvisible_terrain` | bool | 为真时，在 FX 层对不可视格绘制不透明叠色，盖住静态地形。 |
| `occlusion_rgb` | `[r,g,b]` | 叠色 RGB（默认与夜色协调的深灰蓝）。 |
| `occlusion_alpha` | 0～1 | 叠色不透明度；建议接近 1 以形成「未照亮」感。 |
| `strip_dynamic_on_rear_adjacent` | bool | 对**身后三邻格**不叠满遮挡，但**强制不绘制** NPC/敌/地面物/`?`/采集提示（仍可走、可点后退）。 |
| `distance_shade_enabled` | bool | 在**当前可视**格子上按距离叠半透明暗色（近亮远略暗）；需 `enabled`。 |
| `distance_shade_rgb` | `[r,g,b]` | 距离渐暗叠色（默认可略亮于 `occlusion_rgb`）。 |
| `distance_shade_max_alpha` | 0～0.95 | 在可视区最外缘单侧叠色上限（越大越远越暗）。 |
| `distance_shade_start_ratio` | 0～0.9 | 有效半径内前若干比例不叠暗（脚边保持清晰）。 |
| `distance_shade_power` | 0.5～3 | 距离曲线指数，>1 时远缘暗得更快。 |

## 3. 身后三邻格（后退踏板）

- 使用与 `facingDirToVector` 一致的八向朝向单位向量 `fv`（整数格步）。
- 与玩家 **切比雪夫距离为 1** 且相对位移 `(dx,dy)` 满足 **`dx*fv.x + dy*fv.y < 0`** 的格子恰好 **3** 个（背后半空间的三个邻格）。
- **意图**：玩家能看清脚边「能往后踩」的地形，但**不从背后偷看**动态内容；与 `adjacent_detail_radius` 的全邻格细节保底**并行**时，这三格仍以「无动态符号」为准（strip 在元数据层最后施加）。

## 4. 不可视判定（与信息分层一致）

- **有效距离**：`chebyshev(玩家, 格) <= visualRadius * facingMul`，其中 `visualRadius` 来自 `vision_reveal_ui` 与昼夜插值，`facingMul` 来自 `vision_facing_ui` 的前/侧/背夹角与倍率。
- **视场识别保底**：朝向视野开启时，落在视场（前+侧扇区，夹角 ≤ `side_half_angle_deg`）的格子，识别半径提升到 `visualRadius`（看得见即识别类型，不再只显示 `?`）；只有背后（背扇区）才按 `identifyRatio` 分层、保留 `unknownPresence` 的 `?` 提示。
- **不**将 `adjacent_detail_radius` 并入「是否遮挡地形」：否则全邻格永不遮挡，背后扇区无法表现「看不见远处」。
- **遮挡例外**：玩家自身格不遮挡；身后三邻格在 `strip_dynamic_on_rear_adjacent` 为真时不做满幅地形遮挡（与 `hide_nonvisible_terrain` 联动：这两格若 `canVisualRaw` 为假，仍不画遮挡条，仅 strip 动态）。

## 5. 与昼夜层的关系

- FX 绘制顺序：`SceneAnimation` → `vision_day_night` → **`vision_occlusion_ui`（满遮挡）** → **`distance_shade`（可视区内远近渐暗）** → `vision_facing_ui` 扇形装饰（若开）→ 调试 HUD。
- 昼夜径向清晰圈与朝向遮挡独立：同在一格上可叠加表现「夜里近处略亮，但背后仍被方向性遮住」。

## 6. Review 摘要（落实前结论）

- **扇形装饰**与**方向性遮挡**解耦：可关扇形仅保留倍率 + 格级遮挡。
- **身后三邻格**：只保证地形可辨 + 可点击移动，动态内容一律不揭示，避免与「背后无眼」直觉冲突。
- **邻格保底**仍适用于非身后邻格的交互；身后三格以 §3 strip 为优先。

## 7. 实现登记

- `getVisionOcclusionUiConfig`、`isRearAdjacentTriple`、`renderVisionOcclusionOverlay`、`renderVisionDistanceShadeOverlay`、`getDynamicMetaAt` 内身后剥离：`js/scene-renderer.js`
- `facingAngleDeg` / `isInFieldOfView`（视场识别保底）、`render()` 内朝向变化检测（`prevFacingDir` 变化 → 强制动态层整层重画，避免转向后符号层滞留旧状态）：`js/scene-renderer.js`
- 配置：`data/survival-config.json` → `vision_occlusion_ui`；默认已关扇形装饰（`vision_facing_ui.show_cone_overlay: false`），由策划在表中再开。
- **DOM 回退路径**（无 `TileRendererV2` 时）当前**无**格级遮挡叠色；以 Canvas 路径为准。

## 8. 基地院落视野与立体建筑分层（2026-10-25 修订）

撤销院落固定环境全图常显。道路、田地、围栏、树木、柴架和油桶重新遵循现有距离、朝向和昼夜视野配置；不通过美术模块扩大视野，不修改存档或地图。

院落地面遮挡和距离渐暗复用 SceneRenderer 原有视野函数，在动态层绘制立体物件之前执行。上层 FX 不重复叠加地面菱形遮挡，避免黑块按地面坐标切断屋顶和墙面。没有下层遮挡回调时必须回退普通 FX 遮挡，不能默认为全图可见。

建筑外壳按四向连通的真实建筑占地分组。当组内有格子进入当前地形视野时，显示整个外壳；整栋建筑都不在视野中则隐藏。完整显示仅作用于墙、屋顶、窗灯与屋顶通风口，不揭示建筑周围地面、油桶、木堆、树木、资源或动态目标。建筑遮住角色时继续局部剖开，图层同步规则不变。

NPC、敌人、资源状态、地面物品仍使用原有识别与身后三邻格剥离规则。地面入口标签在不可见时隐藏。院落保留统一的昼夜夜色色调，实际可视距离仍随原有昼夜配置缩短或增长。室内、野外、地牢及战斗特效的视野流程不变。

验证：tools/test-yard-visibility.cjs 覆盖真实视野计算、转身、夜间缩距、后退踏板、无地面回调的回退遮挡与动态目标隐藏；tools/test-base-hideout-art.cjs 覆盖完整建筑显隐、地面遮挡位于建筑之下，以及物件不会随建筑连带显露。

## 9. 场景移动时的图层同步（2026-10-25）

地图容器、外置前景建筑和外置战斗画布必须同时使用相同的相机目标及 CSS 过渡。过渡参数读取地图容器的实际样式；不能只同步最终坐标，否则地图缓动过程中外置图层会提前到达终点，形成屋顶缺口和墙体错位。

不用前景建筑的场景将其画布缩为 1×1 并用 `visibility:hidden` 隐藏，保留相机过渡；不以 `display:none` 取消动画。画布已嵌套在地图容器中时，只继承父级变换，不重复平移。

验收包含八向移动、动画途中快速反向、重复终点、关闭平滑移动，以及移动中切换室内外。使用 `tools/test-courtyard-camera.html` 检查浏览器逐帧位置；静止截图与终点坐标一致不能替代移动过程验收。


## 10. 废墟固定兴趣点的问号占位（2026-10-26）

地牢中的采收点、容器、恢复点、潜能点、撤离点，若所在格当前地形可见而未辨认，显示“？”，包括身后三邻格。辨认后显示当前状态棋子，地形不可见时隐藏。这是固定兴趣点对 §3 动态剥离规则的显示例外；敌人、NPC、尸体等动态目标，以及墙和关闭门的遮挡规则不变。详见 [地牢实装记录](dungeon-runtime-integration.md)。
