# 36. UI 自由窗口系统（UI Windows）

> 定案状态：**已定案（设计稿）**。参照《仙境传说 RO》的自由浮动窗口模型：信息面板 = 独立窗口（可拖、可关、可锁、位置记忆、可重置）。本文档为 UI 侧改造的设计正本，实现细节以本文为准；与 `02-regions.md` §2.5 布局约定冲突时，以本文「默认值」为准（默认布局须与设计稿一致）。

---

## 1. 背景与目标

当前界面为**整体写死布局**：左侧状态区是 `#left-hud`（`position: absolute; left:20px; top:20px; width:380px`）内一个可滚动容器 `#status-scroll`，其中 7 个信息块（角色卡、肢体检视、战斗资源、生存、资源、五维、属性经验）无法单独移动/隐藏；右侧按钮列、顶部时间条、Buff 区、底部动作栏+快捷腰带、对话面板同样锚定。唯一有拖拽能力的是游戏日志面板（`game-log.js` 的 `bindPanelChrome`，支持拖拽 + 顶部/左右三向缩放），但**明确不持久化**（`LEGACY_PANEL_POS_KEY` 被清除，注释记录旧版曾因恢复出"左下角窄条布局"而回滚）。

**目标**：仿 RO，把「信息面板」统一抽象为「窗口」：

- **可拖拽**：窗口可移到屏幕任意位置（默认位置 = 现设计稿位置，未自定义时布局与现在完全一致）。
- **可隐藏/显示**：玩家可关闭窗口，再从「窗口列表」重新打开。
- **可锁定**：全局「锁定布局」开关，防止战斗中误拖（RO 同款）。
- **位置记忆**：位置/尺寸/可见性持久化到 localStorage（设备级），重启恢复。
- **可重置**：一键恢复默认布局（兜底，任何持久化异常都回到默认）。

**非目标**：不改动模态弹窗（背包/技能/农业/仓库等保持"弹窗/侧滑"形态，打开耗 1 tick 的规则不变，见 `02-regions.md` §2.5）；不改动对话面板与顶部时间条的固定位置（仅加显隐开关）；不改动动作栏+快捷腰带的底部锚定。

---

## 2. 设计原则（与既有哲学对齐）

- **默认布局 = 设计稿**：窗口的默认位置/尺寸取自现 CSS 与 `02-regions.md` §2.5 约定。玩家未做任何自定义时，界面观感与现在逐像素一致。自定义是「覆盖层」，不推翻默认稿。
- **认知论不破**：`shouldShowBlock('limbs'|'survival'|...)` 决定的是「该块是否已由游戏内途径解锁可见」——这是**游戏数据门控**；玩家拖拽/隐藏是**元层操作**。最终可见性 = `游戏门控 && 玩家偏好`。未解锁的块在窗口列表里**不出现**（认知论：不存在的东西不占位）。
- **0 教学 0 引导**：窗口列表、拖拽手柄、锁定/重置一律自解释（图标+文案，用 `UIText` 键，不弹教程）。
- **持久化带校验**：吸取「窄条布局」教训——每次读取必须 schema 校验 + clamp（尺寸不低于 min、位置夹回视口内），任何一条非法即丢弃该条回退默认；窗口注册表声明 `minW/minH` 与默认尺寸。
- **设备级持久化**（已拍板）：布局是"玩家显示器习惯"，不是角色状态。不写入存档，不随读档/换设备迁移。与存档交互的只有「游戏门控可见性」（走 `shouldShowBlock` 既有通道）。
- **与剧情演出的关系**：`30-story-outline-blackout.md` 的「8 层 UI 被逐层打没」演出（Buff HUD → 生存条 → 快捷栏 → 战斗日志 → 快捷腰带 → 状态卡 → 肢体检视 → 全 HUD）依赖面板可被独立移除——本系统为其提供干净的 API（`UIWindows.hideLayer(...)`），玩家自己隐藏窗口 = 提前体验"设备被摧毁"，叙事自洽。

---

## 3. 窗口分类

| 类型 | 能力 | 说明 |
|------|------|------|
| **自由窗口** | 拖拽 + 可关 + 可锁（全局锁生效）+ 可重置 | 位置/可见性持久化；日志面板额外支持缩放 |
| **锚定窗口** | 仅显隐 + 可锁（防误操作如误关）+ 可重置 | 位置不持久化，始终锚定；只持久化可见性 |
| **模态** | 不参与 | 背包/技能/农业/仓库等弹窗保持现状 |

### 3.1 自由窗口清单

| 窗口 id | DOM | 名称（ui key 前缀） | 默认位置/尺寸 | min | 缩放 |
|---------|-----|---------------------|--------------|-----|------|
| `win-role` | `#status-role-card` | `ui.windows.role` 角色卡 | 停靠于状态区顶部 | 160×64 | 否 |
| `win-limbs` | `#status-limbs` | `ui.windows.limbs` 肢体检视 | 角色卡下方 | 160×64 | 否 |
| `win-battle-resources` | `#status-combat-resources-card` | `ui.windows.battle_resources` 战斗资源 | 默认隐藏（战斗时才出现） | 160×64 | 否 |
| `win-survival` | `#status-survival` | `ui.windows.survival` 生存 | 停靠列中 | 180×80 | 否 |
| `win-resources` | `#status-resources` | `ui.windows.resources` 资源 | 停靠列中 | 160×64 | 否 |
| `win-attrs` | `#status-attrs-block` | `ui.windows.attrs` 基础五维 | 停靠列中（details 折叠块） | 160×64 | 否 |
| `win-attr-exp` | `#status-attr-exp-block` | `ui.windows.attr_exp` 属性经验 | 停靠列中（details 折叠块） | 160×64 | 否 |
| `win-buff` | `#buff-hud` | `ui.windows.buff` 状态效果 | 画面中部（现绝对定位处） | 160×64 | 否 |
| `win-log` | `#game-log-panel` | `ui.windows.log` 战斗日志 | 贴底全宽（现默认） | 220×64 | **是**（沿用现有三向缩放） |

> 默认"停靠" = 保留现 `#left-hud`/`#status-scroll` 内的自然文档流位置；仅当玩家拖动后，该窗口切换为 `position: fixed` 并记录坐标。

### 3.2 锚定窗口清单

| 窗口 id | DOM | 名称 | 能力 |
|---------|-----|------|------|
| `win-time` | `#top-hud` | `ui.windows.time` 时间 | 仅显隐 |
| `win-actions-right` | `#right-hud` | `ui.windows.right_actions` 右侧入口 | 仅显隐 |
| `win-bottom` | `#bottom-hud-stack`（动作栏+快捷腰带） | `ui.windows.bottom_bar` 底部动作栏 | 仅显隐（含腰带，两者联动显隐） |
| `win-dialogue` | `#dialogue-panel` | `ui.windows.dialogue` 对话 | 仅显隐（**默认始终显示**；见 §4.5 约束） |

---

## 4. 交互与行为

### 4.1 窗口装饰（chrome）

每个自由窗口在宿主元素外包一层 `.ui-window`（标题栏 + 内容区），或对既有容器直接加标题栏节点：

- **标题栏**：窗口名（左）+ 关闭按钮 ✕（右）；拖动把手 = 标题栏（点击非按钮区域）。
- **关闭按钮**：隐藏窗口（`visible=false` 持久化）。锚定窗口的 ✕ 同理（仅持久化可见性）。
- **缩放手柄**：仅 `win-log` 保留现有 top/left/right 三向手柄（从 `game-log.js` 抽公共实现）。
- **拖动态样式**：`.ui-window.dragging`（半透明 + 高亮描边），与日志面板现有 `log-panel-dragging` 同风格。

### 4.2 拖拽与缩放（公共 helper）

从 `game-log.js` 的 `bindPanelChrome` 抽出**通用实现** `js/ui-windows.js` 内置：

- 按下 → 记录起点与窗口 rect → `document` 级 `mousemove/mouseup`（防出界丢失）。
- **clamp 规则**（全窗口统一）：
  - 左/上不可出视口（`left ≥ 0`、`top ≥ 0`）；右/下不可出视口。
  - 宽高不低于注册表 `minW/minH`；宽度不超 `innerWidth - 右边距`；高度不超 `innerHeight × 0.72`（沿用 `game-log.js` 现有上限）。
  - 窗口 resize 时重新 clamp（防改分辨率后窗口悬空/出界）。
- **z-index 管理**：拖动/点击时提升该窗口层级（RO 式"点谁谁在前"），上限低于 `#dialogue-input-blocker`（z-40）与对话面板（z-50），即对话期间自由窗口被盖住（与现行为一致：对话时输入屏蔽层盖住 HUD）。
- **锁定布局**：`lock=true` 时，所有窗口禁用拖拽/缩放（标题栏不响应 mousedown），仅允许显隐。

### 4.3 窗口列表菜单（仿 RO）

- 入口：右侧按钮列新增 `btn-ui-windows`（📑 或 ⊞，`data-ui="ui.windows.menu"`），点击弹出窗口列表（可并入现有 ⚙ `player-actions-submenu` 同风格的下拉面板，或独立小面板——实现时二选一，推荐独立面板）。
- 内容：
  1. 所有**当前已解锁**窗口的显隐开关列表（自由窗口 + 锚定窗口）。
  2. 「锁定布局」开关（全局锁）。
  3. 「恢复默认布局」按钮（清空全部持久化覆盖 → 全部回到默认；**含**日志面板，等效 `GameLog.resetLogPanelLayout` 的全局版）。
- 列表只列 `shouldShowBlock` 判定为可见的窗口；未解锁的块**不占位**（认知论）。

### 4.4 持久化 schema（localStorage）

```
键：ui_windows_v1
{
  "version": 1,
  "lock": false,
  "windows": {
    "win-log": { "x": 0, "y": 640, "w": 1280, "h": 100, "visible": true },
    "win-limbs": { "x": 20, "y": 120, "visible": true },
    "win-survival": { "visible": true, "minimized": true, "barX": 560, "barY": 570 }
    // 未出现的窗口 = 默认布局（不写覆盖）
  }
}
```

- **只存被覆盖的窗口**：未自定义的窗口不写条目，加载时用 CSS 默认。好处：默认布局零开销、改动设计稿默认值不破坏老玩家覆盖、`win-log` 未覆盖时保持"贴底全宽"语义。
- **条目字段**：`x/y/w/h`（像素盒，可选）、`visible`（玩家偏好显隐，缺省 true）、`minimized`（是否最小化，可选）、`barX/barY`（任务条位置，可选）。**宽松解析**：位置 / `visible=false` / `minimized=true` / `barX+barY` 任一存在即视为有效条目，否则丢弃（空操作）。
- **加载校验**（每读必做）：数值字段须为有限数；坐标+尺寸夹回当前视口内；`visible`/`minimized` 须为布尔。任一非法 → 丢弃该条（回退默认），不整体炸。`version` 不符 → 整体丢弃重建。
- **写入时机**：拖拽/缩放结束（mouseup）、显隐切换、最小化/恢复、锁切换、重置。高频操作（拖动/显隐）防抖写入（200ms）；低频操作（最小化/恢复/锁/重置/任务条拖拽结束）同步落盘，确保立即生效。
- **任务条位置语义**：`barX/barY` 为任务条左上角像素坐标（`position: fixed`）；未持久化时默认排布在视口底部**日志面板上方**（`BAR_BOTTOM=122`，避开贴底日志 100px + 快捷腰带 ≈106px），多个任务条横向排布不重叠。

### 4.5 最小化任务条（RO 式，2025 新增）

- **交互**：自由窗口宿主右上角 `—` 按钮 → `UIWindows.minimize(id)`：窗口本体 `display:none`，画面生成一条 `.ui-window-bar` 任务条（窗口名 + `↥` 恢复键）。
- **任务条**：可拖拽（模块级单例监听，避免反复最小化泄漏事件）、位置记忆（`barX/barY` 持久化）、受全局「锁定布局」约束（锁定时不可拖）。
- **恢复**：点任务条 `↥` → `UIWindows.restore(id)`：任务条移除，窗口按原显隐恢复。
- **显示条件**：任务条可见 = `minimized && 游戏门控 && 玩家偏好`（经 `applyVisibility → syncTaskBar` 统一驱动）。战斗资源卡门控关闭时任务条**自动消失**，重开自动重现；演出 `hideLayer` → 任务条一并消失，`restoreLayer` 重现；`resetAll` 清空所有最小化。
- **不支持最小化**：`displayManaged === false` 的窗口（`win-dialogue`，DOM 归 DialogueUI 管）最小化按钮不生效。

### 4.6 与既有行为的交互约束

- **对话面板 `win-dialogue`**：显隐开关默认关闭隐藏（即默认显示）；玩家隐藏后，下次触发对话时**自动恢复显示**（对话是叙事核心，不可因玩家误隐藏而错过台词）。实现：`DialogueUI.open()` 时若 `win-dialogue.visible===false` 则临时置 true（不持久化，仅本次会话强制）。
- **快捷腰带同步**：`game-log.js` 的 `syncQuickBeltDockPosition` 把 `#bottom-hud-stack` 底部钉在日志面板上沿。`win-log` 变自由窗口后**该同步必须保留**（`win-bottom` 锚定底部的"贴日志上沿"语义不变）：日志拖动/缩放/resize 时继续调用 `GameLog.syncQuickBeltDock`。若 `win-bottom` 被玩家隐藏，腰带随动作栏一起隐藏，日志同步逻辑仍执行但无可见影响。
- **intro-shell**：`body.intro-shell-active` 期间隐藏 `#left-hud/#right-hud` 等（开场演出），窗口系统不得干预；演出结束恢复时按持久化布局渲染。
- **战斗资源块 `win-battle-resources`**：受 `shouldShowBlock`/战斗状态门控，默认隐藏；进入战斗出现时若玩家曾隐藏过 → 遵循「游戏门控 && 玩家偏好」，仍隐藏（玩家明确不要它）。
- **`updateStatusPanel` 集成**：`scene-app.js` 中 `setBlockDisplay(id, visible)` 是游戏门控的写入口。改造为：`setBlockDisplay` 仍管游戏门控，但实际 DOM 显隐统一经 `UIWindows.setGameVisible(windowId, visible)` 合并玩家偏好后生效。`updateStatusPanel` 内部其余逻辑（数值刷新）不动。

### 4.7 与「8 层 UI 演出」的 API

`30-story-outline-blackout.md` 演出脚本调用（示意）：

```js
UIWindows.hideLayer('win-buff');
UIWindows.hideLayer('win-survival');
// ... 快捷栏 → 战斗日志 → 快捷腰带 → 状态卡 → 肢体检视 → 全 HUD
UIWindows.hideAll();   // 全 HUD（含右列入口）
```

`hideLayer` 走玩家偏好通道的强制版（写 `visible=false`），演出结束后可用 `UIWindows.restoreLayer(winId)` 或直接"恢复默认布局"拉回。实现时与演出脚本对接即可，本期不接剧情。

---

## 5. 架构与落地

### 5.1 文件改动

| 文件 | 改动 |
|------|------|
| `js/ui-windows.js`（**新增**） | 窗口注册表 `registerPanel`、拖拽/缩放公共实现、持久化读写校验、clamp、z-index、`minimize/restore` 最小化任务条（`ensureTaskBar`/`syncTaskBar`/任务条拖拽单例）、窗口列表 `getPanelList`、`hideLayer/restoreLayer/hideAll`、`setGameVisible`、`forceVisible`（对话安全）、`resetAll`、`lock` 全局开关；对外挂 `window.UIWindows` |
| `js/game-log.js` | 删除自带拖拽实现，改为注册 `win-log` 走公共实现；保留 `syncQuickBeltDockPosition`、`resetLogPanelLayout`（内部委托 `UIWindows.resetWindow('win-log')`）；公开 API 保持兼容（`bindPanelChrome` 等仍可用，内部转发） |
| `js/scene-app.js` | `setBlockDisplay` 改造为经 `UIWindows.setGameVisible`；`registerUiWindows` 注册左侧 7 块 + buff-hud + 4 锚定窗口；窗口列表菜单（`rebuildUiWindowsMenu`/打开/关闭/互斥）；初始化时 `UIWindows.init()`（DOM ready 后）；`updateStatusPanel` 行为不变 |
| `js/dialogue-ui.js` | `DialogueUI.open()` 调用 `UIWindows.forceVisible('win-dialogue')`（对话安全：玩家隐藏对话面板后触发对话强制恢复） |
| `index.html` | 各自由窗口宿主加 grip/最小化/关闭按钮（⠿ — ✕ 横向排开不重叠）与 `.ui-window-host` 结构；右侧加 `btn-ui-windows` 与窗口列表面板；`.ui-window-bar` 任务条 CSS；拖拽态/z-index 分层 CSS |
| `data/ui_text_zhCN.json` | 新增 `ui.windows.*` 文案键（名称、菜单、锁定、重置、关闭/最小化/恢复 tooltip） |
| `docs/design/00-index.md` | 模块表加一行 |

### 5.2 初始化顺序

1. `DOMContentLoaded`：`UIWindows.init()` 注册全部窗口（含默认位/尺寸/min/closable/resizable 元数据）→ 读取并校验持久化 → 应用布局。
2. `game-log.js` 的 `bindPanelChrome` 改为注册 + 保留同步逻辑；`scene-app.js` 后续的 `updateStatusPanel` 调用自然生效。
3. 窗口列表菜单由 `UIWindows` 在 init 时挂接。

### 5.3 向后兼容

- `GameLog` 现有公开 API（`log/clear/bindDragScroll/bindPanelChrome/resetLogPanelLayout/syncQuickBeltDock/clampLogPanelForLeftHud`）签名不变，调用方（`scene-app.js` 等）零改动。
- 未做任何自定义的玩家：DOM 结构与现版一致（仅多出装饰元素），布局逐像素不变。
- 旧 localStorage 键 `game_log_panel_pos` 继续在启动时清除（不迁移）。

### 5.4 扩展契约：新面板接入管线（核心承诺）

**任何新面板（信息窗口类）只需一次注册，即可获得整套窗口能力**：拖拽、缩放（可选）、clamp、显隐、锁定、重置、窗口列表自动收录、设备级持久化、z-index 管理、i18n 标题。注册表是唯一入口，管线开箱即用。

#### 5.4.1 `UIWindows.registerPanel(id, spec)` API 契约

| 参数 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 窗口唯一 id（如 `win-fishing`）。**重复注册幂等**：返回既有条目，元数据覆盖、已持久化的布局不被清空 |
| `type` | ✅ | `'free'`（自由窗口，默认）\| `'anchored'`（锚定窗口，仅显隐）\| `'modal'`（预留，本期不开放） |
| `titleKey` | ✅ | i18n 键（`ui.windows.<id>` 约定，见 `35-code-i18n-guideline.md`）；缺失时回退显示 id |
| `el` | ✅ | 元素或**获取函数** `() => HTMLElement`（支持异步/后创建的面板，见 5.4.3） |
| `defaultPos` | — | `'dock'`（默认，保留文档流位置）\| `{x, y}`（固定位）\| 锚定窗口专用位（如 `'anchor-bottom'`） |
| `defaultSize` | — | `{w, h}`；缺省由内容自适应 |
| `minW` / `minH` | — | clamp 下限（自由窗口默认 160×64；日志 220×64） |
| `closable` | — | 是否可关闭，默认 true；`false` 时窗口列表不显示关闭开关 |
| `resizable` | — | 是否可缩放，默认 false（仅 `win-log` 为 true） |
| `gameVisible` | — | 认知门控查询函数 `() => boolean`，默认 `() => true`；返回 false 时：窗口不渲染/不占位、不出现在窗口列表、持久化的玩家偏好保持但不可见。等价于把 `shouldShowBlock` 收敛进注册表，**新面板若有门控需求在注册时声明即可，无需改管线** |
| `displayManaged` | — | 是否由管线控制 `style.display`，默认 true；`false` 时管线只记偏好、不碰 DOM 显隐（`win-dialogue` 用它，DOM 归 `DialogueUI` 的 `.show` class 管）。`false` 的窗口**不支持最小化** |

注册后管线自动完成：装饰（标题栏+关闭钮，若元素尚无）、读取持久化并应用（含校验/clamp）、登记进窗口列表、挂接拖拽/缩放/锁。元素尚不存在时注册也合法——`applyLayout(id)` 在元素出现后再调用一次即可。

#### 5.4.2 新增静态面板的最小接入

```html
<!-- 新功能模块的 HUD 面板，HTML 与其它面板一起写好 -->
<div id="fishing-hud" class="fishing-hud">…</div>
```

```js
UIWindows.registerPanel('win-fishing', {
  type: 'free',
  titleKey: 'ui.windows.fishing',
  el: () => document.getElementById('fishing-hud'),
  defaultPos: 'dock',
  minW: 200, minH: 80
});
```

三件事：**写 HTML、调一次 registerPanel、加 i18n 键**。拖拽/持久化/窗口列表/重置全部免费。

#### 5.4.3 动态创建的面板（模块异步注入 DOM）

新模块可能在自己初始化时才创建元素（如仓库/畜牧面板挂载）。约定：

```js
// 模块初始化（元素未创建时即可注册）
UIWindows.registerPanel('win-forge', { type: 'free', el: () => document.getElementById('forge-hud'), … });
// 元素创建完成后补一次应用（幂等，自动补装饰 + 应用持久化布局）
UIWindows.applyLayout('win-forge');
```

管线不假设元素在 init 时存在，`el` 用获取函数 + 延迟 `applyLayout` 即可。

#### 5.4.4 临时出现/消失的面板（如战斗资源卡）

受状态门控的窗口：`gameVisible` 返回 false 时自动隐藏且**不占位**（认知论）；状态切换时由既有刷新入口（如 `updateStatusPanel`）自然触发。面板无需自己管理显隐，只声明门控即可。

#### 5.4.5 不适用的情况（边界声明）

- **模态弹窗**（背包/技能/农业/仓库等子界面）：按 `02-regions.md` §2.5 保持"弹窗/侧滑"形态，**不走本管线**；后续若需模态可拖，再开放 `type:'modal'`（`registerPanel` 已预留该枚举，本期不实现）。
- **对话面板/时间条等叙事元素**：走锚定窗口（仅显隐），见 §3.2。
- **加载时忽略注册表外 id**：持久化数据里出现的未知窗口 id（旧版本残留）一律丢弃，不报错、不残留。

---

## 6. 验收标准

1. **默认布局不变**：全新玩家打开游戏，界面与当前版本逐像素一致（截屏对比）。
2. **拖拽**：每个自由窗口可拖到任意位置，不出视口、不丢鼠标（含快速甩动）。
3. **缩放**：`win-log` 三向缩放行为与现在一致（min 220×64、上限视口内）。
4. **持久化**：拖动/隐藏/锁后刷新页面，布局恢复；改窗口分辨率后仍在视口内（clamp 生效）。
5. **重置**：一键恢复默认布局，所有窗口回默认位/默认可见性。
6. **锁定**：锁定后拖拽/缩放失效，显隐仍可用。
7. **门控合并**：`shouldShowBlock` 返回 false 的块（未解锁）不在窗口列表出现；玩家隐藏过的已解锁块保持隐藏。
8. **对话安全**：玩家隐藏对话面板后触发对话，面板强制出现。
9. **演出 API**：`UIWindows.hideLayer/hideAll/restoreLayer` 调用后 DOM 显隐正确（单元验证）。
10. **i18n**：新增文案全部走 `UIText.t`，无硬编码中文。
11. **旧档/旧键**：`game_log_panel_pos` 清除逻辑保留；存档读写无新增字段（设备级，不进存档）。

---

## 7. 实施阶段

- **M1（基础）** ✅：`js/ui-windows.js` + 注册表 + 拖拽公共实现 + 持久化校验；`win-log` 迁移（复用现有代码抽公共）；验证默认布局不变。
- **M2（自由窗口铺开）** ✅：左侧状态区 7 块 + `win-buff` 加装饰（⠿ 拖拽 / — 最小化 / ✕ 关闭）、可拖可关；`setGameVisible` 门控合并接入。
- **M3（锚定窗口 + 菜单）** ✅：`win-time/win-actions-right/win-bottom/win-dialogue` 显隐；右侧 `btn-ui-windows` 窗口列表、锁定、恢复默认；i18n 键补齐。
- **M3.5（最小化任务条）** ✅：`minimize/restore` + `.ui-window-bar` 可拖拽任务条（恢复键、位置记忆、门控/锁/重置联动）；修复按钮重叠（⠿ — ✕ 横向排开）与任务条被日志遮挡（`BAR_BOTTOM=122`）。
- **M4（对话安全 + 收尾）** ✅：`DialogueUI.open()` → `forceVisible('win-dialogue')` 强制恢复（不持久化）；intro-shell 兼容（`!important` 优先于 inline）；文档 §6 验收 11 条全过。

## 8. 待定（后置，不在本期范围）

- 快捷键切换窗口（RO 的 Alt+键）。
- 窗口合并（RO 的"合并窗口"：多块合成一个大窗）。
- 自由窗口加宽度缩放（非日志窗口）。
- 布局方案导出/导入（文本配置，RO 的 optioninfo.lua 精神）。
- 任务条双击恢复（当前仅 ↥ 按钮）。
