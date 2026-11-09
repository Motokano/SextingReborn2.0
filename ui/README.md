# Svelte 主 HUD 与公共交互

2026-10-17：用户确认的技能装配 B 版已正式接入默认入口，包含招式表、肌群总览和双列肌肉弹窗。默认 HUD 通过 `runtime/combat-mount.js` 只挂载 CombatPanel；完整 Svelte 模式使用同一组件。正式材质位于 `css/combat-loadout.css`。其他面板仍按下文的迁移开关运行；详见[技能装配定稿记录](../docs/design/skill-loadout-ui.md)。

2026-10-14：用户确认携行试点后，继续完成 P1 剩余主 HUD 的组件接入。完整入口为 `http://127.0.0.1:8000/?no_reload&ui=svelte-hud`；默认入口保留原 C HUD，`ui=svelte-carry` 保留独立携行对照。完整阶段状态见 [执行表](../docs/migration/svelte-ui-execution.md)。

## 运行与构建

```sh
npm ci
npm run check:ui
npm run build:ui
npm run dev
```

需要编译监听时用 `npm run dev:ui`，它先编译，再启动 UI 监听和原静态服务器；可追加端口，例如 `npm run dev:ui -- 8001`。不要同时在同一端口启动第二个服务器。`no_reload` 仍由原服务器处理。

依赖由根目录 `package-lock.json` 锁定。`assets/ui/svelte-hud.js` 是需要随源代码一同提交的生成文件，使现有静态服务器可以直接运行；修改 `ui/src` 后必须重新构建，不手改产物。构建只输出到 `assets/ui`，不清空其他美术资源。组件直接沿用完整的 `ui-moss-runtime.css` 与 `ui-moss-game.css`，本轮未修改任何材质 CSS 或美术资源。

## 实现与所有者

| 区域 | 新所有者/入口 | 保留的行为 |
| --- | --- | --- |
| 身体 | StatusPanel 的 body 分支、readBody | 七部位、累计损毁、概况/精确读数、伤态条、原提示与调试动作 |
| 生存 | StatusPanel 的 survival 分支、MetricRow | 六项主读数、心情/肮脏度补充入口、逐字段认知过滤 |
| 成长 | StatusPanel 的 growth 分支、readGrowth | 五维、先天/当前 title、潜能/战斗经验、研习/属性经验；attrs/resources 分开门控 |
| 携行 | CarryPanel、readCarry | 负重、容量、剩余容量、已知体重 |
| 战斗 | StatusPanel 的 battle 分支、readBattle | 气力/底气、护体、眩晕、疼痛/药效、成瘾/毒性；交战与异常相关性 |
| 状态 | StatusPanel 的 effects 分支、readEffects | 自身/目标、最近敌方回退、层数/剩余回合、手动期限、悬停说明、buffHudVisible |
| 环境 | TopShell、Environment | 顶栏时间/日期/天气/温度、日历/温度计知识、HUD 剧情开关 |
| 事件记录 | Journal、GameLog.getEntries/subscribe | 阅读/全部筛选、拖动滚动、历史位置、新记录按钮、清空、原系统时钟、time 门控 |
| 面板管理 | WindowMenu、UIWindows.subscribe | 勾选、锁定、重置、键盘与焦点、地图视角、状态动画；公开 openUiWindowsMenu 转发到组件 |

`runtime/full-hud.js` 是页面级组合根；`runtime/layout.js` 逐式保留原 C 排列规则，`runtime/icons.js` 保留原图标路径。场景地图节点不重建。2026-10-15 接入 P2 后，导航、动作栏、腰带、创角、对话和 NPC 菜单改由 runtime/interactions.js 组合；P3 的背包、装备、技能、存档和基础仓库已由 runtime/panels.js 接管；设施内容留待 P4。

`bridge/hud.ts` 只查询现有业务模块。快照在发布前过滤未知值，嵌套展示数组/对象冻结；同一批刷新合并、相同快照不重复通知。组件不从旧 DOM 反读数据。初始化通过 AppBoot.afterReady 后才发布游戏读数；SceneCtx 的规则 setter、SceneHud、Weather、Renderer、GameLog 和窗口通知更新对应领域。

窗口外框的位置、拖动、存储与夹回视口继续使用 UIWindows，内部内容与按钮由 Svelte 独占。managedChrome 阻止旧按钮绑定/文字改写。完整 WindowLayout 规则/存储提取尚未完成，不能把它说成整个窗口服务已被重写。沿用 `ui_windows_moss_c_v1` 与既有窗口 ID，不清空用户布局或游戏进度。

完整模式下，ui-moss-game 和 game-theme 不再执行 DOM 改造/装饰 Observer；SceneApp 保留休息计时、饥饿表现、天气观察、快捷栏与动作菜单业务，跳过已迁移 HUD 的 DOM 写入；Weather、Renderer 和 GameLog 发布刷新而不写新子树。原 HUD 子树在挂载前被替换，不保留隐藏副本。调试按钮调用提取的同一原动作函数，不模拟点击隐藏按钮。

日志保留原来的两种保留范围：getLineCount 的内部缓冲上限仍为 80，而显示历史一直保留至 clear，迁移没有把玩家可回看的历史截短为 80 行。

生命周期为页面内单次挂载；pagehide 释放桥接订阅、组件监听器和观察器，bfcache 不卸载。窗口关闭是隐藏外框，不反复销毁/创建组件；当前不支持销毁后在同页重挂。UIWindows 的页面级外框监听器仍随页面结束释放。

## 检查与限制

```sh
npm run test:ui-bridge
npm run test:ui-carry
npm run test:ui-hud
node tools/test-ui-windows.mjs
node tools/test-moss-ui-windows.mjs
node tools/test-quickbar-independent.mjs
node tools/test-reset-progress-dialog.mjs
```

2026-10-14 检查结果：构建通过；svelte-check 0 错误/0 警告；桥接/携行/全 HUD/真实模块离线集成合计 18 项通过；原窗口 24 项、C 窗口 3 项、快捷栏和清空确认回归通过。

- `test-svelte-hud.mjs`：编译后的完整组件、已知/未知组合、抛错门控、残留精确 tooltip 清除、状态/战斗、窗口操作、键盘管理、单次动作、日志历史/滚动、三档宽度排列规则、释放。
- `test-svelte-hud-game.mjs`：加载正式入口全部本地脚本和配置，在隔离内存 DOM/存储中启动真实游戏；检查体力消耗、规则 setter、环境开关、公开管理入口、真实存档快照恢复、地图节点身份不变。
- 同一隔离场景对照旧 HUD 与 Svelte：29 个读数节点的文字、标签类型和 CSS 类名，10 个进度条宽度，7 个窗口外框类名全部一致。

离线测试不访问运行中的浏览器、游戏服务器或用户存档；Canvas/音频使用空平台替身，不能证明材质、字体、实际布局、地图画面或性能相同。既有浏览器工具安全策略拒绝仍未解除，本轮没有绕过限制进行现场截图。V01/V02 等浏览器视觉、真实拖动尺寸与完整游玩流程仍待验收；保持 opt-in，P1 尚未宣告整体完成。用户本轮授权继续接入剩余 HUD，不等于已完成这些现场验收。

构建方案参考 [Svelte 挂载 API](https://svelte.dev/docs/svelte/imperative-component-api) 和 [Vite library build](https://vite.dev/guide/build.html#library-mode)。

## P2 公共交互接入（2026-10-15）

用户确认主 HUD 后授权进入下一阶段。同一 `?no_reload&ui=svelte-hud` 入口现在包含下列组件；默认原生 HUD 和携行对照入口继续保留。P2 的构建和离线回归已完成，现场视觉、触摸设备和性能验收仍待完成，不能据此宣告全量迁移完成。

| 区域 | 所有者与业务接缝 | 保留内容 |
| --- | --- | --- |
| 对话 U14 | Dialogue + DialogueUI.attachView/getView/next/choose | 完整头像、名字、正文、24ms 打字、换行、分支、下一句、完成回调、遮罩；棋子资源继续用 DialoguePawn |
| 创角 U13 | Creation + SceneApp.creation | 姓名、性别、身高、五维、惯用手脚、自动分配剩余点；原初始化/物品发放/重算路径，重复提交守卫 |
| NPC U15 | NpcMenu + NPCSystem.menu | 闲聊与所有设施按钮、禁用与提示；原值班/清洁/剧情守卫；关闭或位置改变后拒绝过期异步结果 |
| 动作 U11/U17 | ActionMenu、ContextActions + SceneApp.actionMenu/runContextAction | 呼吸法、蹑步、休息、固定槽、采集气泡及上下文按钮；Renderer 发布模型，直接业务调用 |
| 腰带 U12 | QuickBelt + readBelt/beltActions | 口袋/背心顺序、1–9、已知物品名、使用/装备/丢弃、原两侧浮窗定位；按实例检查过期操作 |
| 提示 U16 | Tooltip + SceneUi.buildItemTooltipView | 属性、部位、Buff、物品说明模块、字段规则、连接树；查询阶段过滤未知内容，无 HTML 解析或 @html |
| 确认 U18 | ResetConfirmation + ResetProgressDialog.attachView | 原文案、尺寸、取消、清除失败重试、成功重载；测试只使用内存存储和模拟删除函数 |
| 导航 U02 | NavButton、ActionMenu | 原图标路径、标题与切换行为；背景音乐及其开关已于 2026-11-09 移除 |
| 输入 | createOverlayHost | 顶层弹窗优先、Tab 循环、Escape、焦点恢复、对话 Enter/空格；既有 P3/P4 modal 仅登记外层焦点/关闭业务，不重建内容 |

原入口不再加载 React、ReactDOM、dialogue-react-view.js。原生对照使用 DialogueUI 已有原生分支；旧文件/参考页尚未整体清理，留到 P5 的依赖审计。P2 组件替换原节点并停止旧绑定，不保留隐藏按钮代理。对话头像、地图渲染、玩法计时与存档格式未替换。

P3/P4 尚未迁移的专业面板继续调用旧 HTML tooltip；它们与新 Tooltip 各自独占自己的节点，显示时互斥。新 tooltip 通过同等 specificity 的 CSS 选择器别名共享旧样式，未改样式值、材质和美术资源。专业调用方会在对应阶段改用结构化查询，当前没有把这些调用方标记为已迁移。

检查：`npm run test:ui-interactions`。9 项真实模块离线集成覆盖对话打字/分支/单次完成、迟到头像、新档主管剧情→创角、创角输入/100点/单次发放、NPC 请求取消、清除失败/重试、导航与固定槽、鼠标/数字键各消耗一次物品与时间、未知腰带清除、旧存档恢复。全部物品模板在普通和高技能认知两档下，新旧详情文字与 CSS 类名逐一对照。连同 P1 的 18 项检查共 27 项。离线 Canvas/音频替身、模拟触摸和尺寸规则检查不等同于实际游戏截图或触摸设备验收。

## P3 核心面板接入（2026-10-15）

同一 `?no_reload&ui=svelte-hud` 入口已接入 Backpack、AssemblySlot、BaseWarehouse、CombatPanel、SkillOverview、SavePanel。包含全部容器/搜索/详情、地面拾取与装备、防具模块弹层、连接部件、七部位外敷、技能三分页、自修、肌肉分页/被动、招式与变式槽、中枢、出招顺序、本地/导出/导入/复制。继续使用原 CSS、结构类名和业务 API，本轮没有修改材质、尺寸或配色。

`npm run test:ui-panels` 构建后运行 7 项新增真实模块离线回归；连同 P1/P2 共 34 项 UI 检查通过。验证同存档文字/类名（忽略节点间空白）、20 次开关、单次消耗/耗时、过期实例和选择器、模块失败退回、嵌套焦点、部件质量守恒、技能配置、自修，以及真实 WebCrypto 往返、错误凭据/损坏码/旧世代拒绝、双击与迟到结果。当前正式变式表为空，操作分支使用测试变式验证；测试容量背包不写入正式物品表。

构建与静态检查通过；实例身份、装配、装配显示、步法和旧防御变式退出回归通过。额外的物品目录一致性测试失败：已有新版目录多两条鱼，旧源与目录未同步，相关文件和构建器相对 HEAD 未改动，本轮不覆盖这些数据。实际浏览器视觉/性能限制仍同上，未宣称现场验收或全量迁移完成。默认原生对照、P4 设施和 P5 收尾保留；未自动提交。

## P4a 共用设施与藏身处接入（2026-10-15）

同一 `?no_reload&ui=svelte-hud` 入口已接入设施劳动、修复/装配、藏身处仓库和工具台。`runtime/facilities.js` 组合 FacilityLabor、FacilityRepair、MaterialContribution、Toolbench、HideoutWarehouse；继续直接使用原 CSS，未改材质、颜色、尺寸或美术。

原 `facility-labor-panel`、`cooking-repair-panel`、`toolbench-panel`、`hideout-warehouse-panel` 通过 `attachView` 发布结构化展示模型；挂接后原渲染和 DOM 事件分支不再执行。面板打开状态与原生节点引用分离，劳动与施工仍由原控制器持有唯一计时器。独立修复和两处嵌入交付共用 MaterialContribution；旧消费者继续使用原公开 open/close 接口。没有 HTML 字符串解析、`@html` 或隐藏旧视图代理。

仓库保留分页、筛选、详情、标星/锁定、单件/整堆/填满取出、双击快取、批量存入、理仓、材料来源偏好、路线发现、分次备料与施工。新动作校验实例与数量，避免旧按钮取走替换后的物品。材料模型只发布已知名称、可用量、选量、进度描述和回执，不发布材料内部点数/需求表。日历和温度计交付成功会刷新现有场景与 HUD，湿度计仍显示原来的未开放提示。

`npm run test:ui-facilities`：6 项真实模块离线回归，覆盖新旧可见节点/类名/文字及滑条值对照、材料失败回滚/失效选量/整件回执、环境认知、单次劳动和施工消耗、暂停/离开/页面隐藏、失败后重试、读档手动继续、扩建完成、实例往返/过期动作/锁定与前哨限制、共用缝纫装配施工及卸载释放。前哨分支用隔离测试地图标记启用，不改正式地图。可见对照不要求复刻原生隐藏节点中的残留文本。

本轮构建通过，svelte-check 0 错误/警告；合计 44 项 UI 回归通过（原 34 项、面板恢复入口 4 项、本阶段 6 项）。原设施劳动、修复、设施解锁、仓库业务检查通过。仍为隔离 DOM/Canvas 替身检查，不能替代现场视觉、真实设备和性能验收；默认入口保持原生，未提交。下一子阶段为 P4b 农业管理。
