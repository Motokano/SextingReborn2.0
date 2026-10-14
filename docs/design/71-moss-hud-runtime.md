# C / reference 游戏 HUD 接入

2026-10-11：用户认可的基准是 `ui-moss-prototype.html?variant=C&style=reference`，包含 polished、material-study、reference-study 全部叠加规则。原型保留用于对照；正式游戏不加载 MossUIDemo 或原型模拟工具条。

## 样式来源

运行 `node tools/build-moss-runtime-css.mjs`，从完整 `css/ui-moss-prototype.css` 生成 `css/ui-moss-runtime.css`。生成器只改作用域及 panel 类名，保留材质声明。`css/ui-moss-game.css` 负责实际节点兼容、附加真实功能和窄屏排布。不要以近似样式替换生成文件。旧 layout / matte 样式不再在本体加载，避免覆盖渐变与阴影。

## 真实数据与认知

`js/ui-moss-game.js` 在 bootstrap 前改造已有节点，使用 AppBoot.afterStart 完成窗口注册，包装 SceneHud.refresh 保留原状态更新。数字来自 Survival、CharacterAttributes、InventoryEquipment、GameTime、Weather；没有演示常量。

分类门控为 `SceneCtx.shouldShowLeftHudBlock(id)`：limbs、survival、attrs、resources、carry、buff_hud、combat_resources、journal。成长窗口可由 attrs 或 resources 解锁，其内部属性、属性经验与资源分别门控。未知分类不进入面板管理。

具体读数使用 `SceneCtx.shouldShowSurvivalMetric(id, Survival.getState())`：body_detail、satiety、thirst、stamina、energy、fatigue、nutrition、mood、dirtyness、weight、time、date、weather。日期另受 `observation_calendar_unlocked` 标记约束。body_detail 未知时显示概况，隐藏精确损毁条及恢复 tick 提示。未知 time 同时隐藏日志时间戳。

已有字段 ID 保留：`limb-rows` 下各 `limb-*`、`status-metric-*`、`status-attr-*`、`status-potential`、`status-combat-experience`、`status-study`、`status-attr-exp-block`、`status-carry`、`status-weight`、`hud-time-period`、`hud-time-text`、`hud-weather`。新增 `moss-carry-bar`、`moss-capacity-left` 由真实容量与负重计算。生存标题 ⋯ 保留情绪和清洁；成长标题 ⋯ 保留研习与属性经验。原背包、技能、存档、快捷栏等入口继续使用原处理程序。

战斗窗在交战或疼痛、眩晕、药瘾、毒性存在时显示；眩晕取 InventoryEquipment，药瘾和毒性取 PharmacyEffects.getInfo。标题环境显示游戏时钟；日志时间戳保留 GameLog 原有系统时钟，两者不同。

## 窗口存储

C 主题采用独立设备布局键 `ui_windows_moss_c_v1`。首次从 `ui_windows_v1` 迁移关闭/锁定偏好，不迁移旧像素坐标；旧键与角色存档不改。旧 resources / attrs / attr-exp 合并成长，菜单不出现重复入口。folded 字段持久化标题内收起状态。

GameLog 会提前局部初始化 UIWindows；此时必须保留尚未注册窗口的存储。仅 MossGameHUD.registrationComplete 后清理未知窗口条目，避免跨重载丢失 carry 等状态。正常刷新不会重置拖拽位置。

## 验收

`node tools/test-ui-windows.mjs`：24 项；`node tools/test-moss-ui-windows.mjs`：迁移、分阶段注册、折叠与脏存储 3 项。隔离浏览器通过正常建号入口进入实际游戏，验证真实状态、分类与字段门控、拖拽/关闭/恢复、跨重载保留、异常状态、原背包/技能/存档弹窗和 390px 滚动可达性。1440px 下 15 个代表组件的 240 项材质/字体 computed style 与原型同值。1024px 调整数字字号，390px 按实际顶栏与可用宽度纵向排列，所有面板可滚动访问。

## 后续用户授权：紧凑尺寸

用户认可接入后要求缩小UI占地。本体桌面底部四窗由340×358改为272×280，居中贴底18px；1024px视口自适应为240×280。事件记录由360×240改为300×200，状态宽230、战斗宽220，桌面顶栏由64改为54px。压缩标题、留白、行距和数字字号，全部材质、信息、门控与交互保留；390px仍纵向滚动。尺寸CSS约束覆盖旧存储宽高，但不清理自定义坐标或显隐偏好。上述240项样式同值属于初次接入验收；本轮字号和尺寸已按用户新要求调整。四窗默认内容scrollHeight等于clientHeight，六项生存与七部位无需内部滚动。
