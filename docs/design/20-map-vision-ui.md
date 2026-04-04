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
- 配置：`data/survival-config.json` → `vision_occlusion_ui`；默认已关扇形装饰（`vision_facing_ui.show_cone_overlay: false`），由策划在表中再开。
- **DOM 回退路径**（无 `TileRendererV2` 时）当前**无**格级遮挡叠色；以 Canvas 路径为准。
