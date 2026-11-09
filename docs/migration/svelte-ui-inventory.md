# Svelte 迁移界面清单

关联：[总方案](svelte-full-ui-migration.md) · [接口表](svelte-ui-contracts.md) · [执行表](svelte-ui-execution.md) · [验收表](svelte-ui-validation.md)。盘点日期：2026-10-14。

下表按可独立验收的界面划分，不把每个按钮当成独立项目。每行包含其搜索、选择器、空状态、错误提示、键盘操作和嵌套弹层。2026-10-15：U03–U10 主 HUD 和 U11–U18 公共交互已接入 ui=svelte-hud；U02 导航按钮也已迁移。P3 的 U19–U24 背包/装备/基础仓库/技能/存档及附属选择器已接入；P4a 的 U25–U28 设施劳动/修复/藏身处仓库/工具台已接入；U29 之后留待 P4b–P4f。离线检查通过，现场视觉/性能验收待完成；完成情况以执行表为准。“当前”列保留迁移前盘点，路径以仓库根目录为基准。

## 主场景与 HUD

| 编号 | 界面/现有节点 | 当前渲染或交互来源 | 数据及动作边界 | 目标组件 | 阶段 |
| --- | --- | --- | --- | --- | --- |
| U01 | 应用外壳、场景容器、加载失败 | index.html；js/bootstrap.js；js/scene-app.js；js/scene-renderer.js | 等待配置/地图/读档；渲染器独占地图子树；启动失败保留无框架兜底 | GameApp、SceneHost、BootStatus | P1/P5 |
| U02 | 顶栏、时间/日期/天气、导航 | #top-hud、#right-hud；scene-renderer.updateTopTimeHud；weather；ui-moss-game | GameTime、Weather、NPC 观测解锁；导航调用原动作 | TopBar、EnvironmentReadout、GameNavigation | P1；导航细节 P2 |
| U03 | 身体 #status-limbs、#limb-rows | scene-app.updateLimbBlock；ui-moss-game | CharacterAttributes 七部位累计损毁与上限；body_detail 控制精确读数及恢复提示 | BodyPanel | P1 |
| U04 | 生存 #status-survival 及 ⋯ | scene-app.updateStatusPanel；ui-moss-game | Survival；六项主指标、情绪/清洁补充；每项独立门控 | SurvivalPanel | P1 |
| U05 | 成长 #status-attrs-block、#status-resources、#status-attr-exp-block | scene-app.updateStatusPanel；ui-moss-game | 属性、潜能、战斗经验、研习、属性经验；attrs/resources 分别门控 | GrowthPanel | P1 |
| U06 | 携行 #status-carry-card | ui-moss-game；scene-app | CharacterAttributes.getCarryCapacity、InventoryEquipment.getCurrentCarryWeight；剩余容量与体重不能混淆 | CarryPanel | P1 |
| U07 | 状态 #buff-hud | scene-app 内 renderBuffHud；game-theme 装饰 | BuffSystem 玩家/敌方效果与已有可见信息、到期变化 | EffectsPanel | P1 |
| U08 | 战斗 #status-combat-resources-card | scene-app；ui-moss-game | Survival、InventoryEquipment、PharmacyEffects、CombatEngagement；交战或异常状态相关时显示 | BattleResourcesPanel | P1 |
| U09 | 事件记录 #game-log-panel | game-log；game-theme；ui-moss-game 的 game-log-appended 处理 | 日志条目、分类、滚动、最新记录提示；未知时间隐藏时间戳 | JournalPanel | P1 |
| U10 | 面板管理、拖动/收起/关闭/锁定/重置、剧情隐藏层 | ui-windows；scene-app.registerUiWindows/initUiWindowsMenu；game-theme-navigation | 游戏可见性和玩家偏好分开；旧窗口 ID 和布局键兼容 | PanelFrame、PanelManagerMenu、WindowLayout | P1 |
| U11 | #action-bar-dock、玩家动作菜单、四个固定动作位 | scene-app 玩家动作/快捷位函数；scene-systems；scene-renderer | 采集、停止、取水、加料、休息等既有动作；固定槽不得靠按钮文本识别 | ActionBar、PlayerActionsMenu | P2 |
| U12 | #quick-belt-dock、物品腰带、悬停菜单、数字快捷键 | scene-renderer.updateQuickBelt/openQuickBeltHoverMenu；scene-systems | InventoryEquipment 槽位来源；SceneApp.tryUseQuickBeltDigit/tryUseItemFromContainer/tryEquipItemFromContainer | QuickBelt、QuickItemMenu | P2 |

## 剧情与通用交互

| 编号 | 界面/现有节点 | 当前渲染或交互来源 | 数据及动作边界 | 目标组件 | 阶段 |
| --- | --- | --- | --- | --- | --- |
| U13 | #character-creation-overlay | scene-app.initCreationUI/openCharacterCreationAfterIntro | 姓名、身高、属性点；序章完成顺序、校验与最终提交 | CharacterCreation | P2 |
| U14 | #dialogue-panel、头像、名字、正文、按钮、选项、输入遮罩 | dialogue-ui；dialogue-react-view；dialogue-pawn | 对话推进/完成回调只发生一次；头像继续使用既有资源与展示规则 | DialoguePanel、DialoguePortrait | P2 |
| U15 | 动态 #npc-menu | npc-system.ensureMenuEl/openMenu | NPC 定义、值班/距离/清洁/剧情条件；闲聊、设施及其他现有按钮 | NpcMenu | P2 |
| U16 | 物品/属性/部位提示、物品模块和连接详情 | #item-tooltip；scene-ui；scene-renderer；item-info-modules；item-field-display-rules；item-assembly-display；scene-app | 认知等级、字段规则与实例信息；展示逻辑与 HTML 字符串分离 | TooltipHost、ItemDetails、ItemAssemblyTree | P2，专业调用方随 P3/P4 接入 |
| U17 | 地图/人物交互菜单、采集气泡、地面操作入口 | index.html；scene-app 动作接线；scene-systems；scene-renderer | SceneCtx.actions 路由；地图命中计算仍留渲染器；输入阻挡不得漏 | WorldInteractionMenu、WorldActionHints | P2 |
| U18 | 清空进度确认、统一消息、内层选择/确认弹层 | reset-progress-dialog；scene-app.showMsg；各调用方 | 取消无副作用；删除失败不重载；现有消息进入日志 | ConfirmDialog、FeedbackHost、OverlayHost | P2，专业弹层随各阶段迁移 |

## 物品、角色与存档

| 编号 | 界面/现有节点 | 当前渲染或交互来源 | 数据及动作边界 | 目标组件 | 阶段 |
| --- | --- | --- | --- | --- | --- |
| U19 | #modal-backpack 的容器、物品列表、筛选、详情、操作 | scene-app.updateBackpackPanel；InventoryHelpers；SceneUi | 物品实例与容器位置、携带/地面/使用动作；不以 item_id 代替实例身份 | InventoryPanel、ItemList、ContainerView | P3 |
| U20 | 背包装备区、部件拆装、动态模块选择器、给药部位选择 | scene-app.renderEquipList/renderModuleArea/openModulePicker；item-assembly-display | InventoryEquipment、ItemAssembly、ItemUse；装备交换、溢出与失败退回 | EquipmentPane、EquipmentModulePicker、BodyPartPicker | P3 |
| U21 | #modal-base-warehouse | scene-app.openBaseWarehousePanel 及绑定 | 既有基地仓库内容和领取动作；与藏身处仓库入口分别保留 | BaseWarehousePanel | P3 |
| U22 | #modal-combat、#picker-move | scene-app.renderCombatModal/openMovePicker/renderMusclePassivePanel | CombatSkills、CombatVariants、Muscles；技能/招式序列、肢体装配、呼吸/步法、中枢和被动 | CombatSkillsPanel、MovePicker、MusclePane | P3 |
| U23 | #modal-survival，生存/生活/特殊技能分页 | scene-app.renderSurvivalModal、renderSkillOverview* | SurvivalSkills、研习与潜能等既有升级逻辑；解锁条件 | SkillOverviewPanel | P3 |
| U24 | #modal-save，本地保存、导出、复制、导入 | scene-app.openSavePanel 及绑定；save-system | saveNow/exportSaveCode/importSaveCode；异步结果、版本/世代保护和失败反馈 | SavePanel | P3 |

## 设施与专业玩法

| 编号 | 界面/现有节点 | 当前渲染或交互来源 | 数据及动作边界 | 目标组件 | 阶段 |
| --- | --- | --- | --- | --- | --- |
| U25 | #modal-hideout-warehouse、#hw-upgrade-overlay | hideout-warehouse-panel；scene-app 开关入口 | HideoutWarehouse；分页/过滤/选槽/取放、建设计时和加载中暂停 | HideoutWarehousePanel、WarehouseUpgrade | P4a |
| U26 | 动态设施清理/劳动界面 | facility-labor-panel | FacilityLabor；开工/暂停/保存/离开/转修复，页面隐藏时暂停 | FacilityLaborPanel | P4a |
| U27 | 动态修复/装配界面和嵌入材料选择 | cooking-repair-panel 导出 FacilityUnlockPanel、CookingRepairPanel | FacilityUnlock、CookingRepair；选材料、提交、回执、嵌入/独立模式 | FacilityUnlockPanel、MaterialContribution | P4a |
| U28 | 动态 #toolbench-panel | toolbench-panel | FacilityUnlock；日历/温度计；湿度计按现有“尚未开放”状态处理 | ToolbenchPanel | P4a |
| U29 | #modal-agriculture、地图格、任务、细节、动作、能源选择 | agriculture-panel；agriculture-overview；scene-app | AgricultureMap；SceneApp.tryAgricultureAction；自动/手动 tick、任务取消与能源 | AgriculturePanel、AgricultureGrid、AgricultureDetail | P4b |
| U30 | #modal-livestock，概览/动物/模块/产品、饲料/能源选择 | livestock-panel；scene-app；hunting-panel.renderAdmission | LivestockState；移动、模块、喂养、清理、收获、屠宰、尸体、收容；面板内扣体力/奖励逻辑须先抽出 | LivestockPanel、AnimalDetail、LivestockProducts | P4c |
| U31 | #modal-cooking-station，方法/材料/燃料/水/配件/图鉴 | cooking-station-panel；scene-app.tryCookAtStation；cooking-station | CookingStation、StationContext、RecipeSystem；制作/守卫/耗时；不得重新实现配方算法 | CookingStationPanel | P4d |
| U32 | #modal-pharmacy-station，单方/复方/剂型/配件/燃料 | pharmacy-station-panel；scene-app.tryPharmacyAtStation/tryCompoundAtStation | PharmacyStation、PharmacyCompounding、RecipeSystem、PharmacyEffects | PharmacyStationPanel | P4d |
| U33 | #modal-compost-station，准备/发酵/观察窗口/历史/结果 | compost-panel；compost-system | CompostSystem；分阶段投入、交互选择、产物领取/丢弃、熟练度；保留现有开关面板的 tick 行为 | CompostPanel | P4d |
| U34 | #sewing-station-panel 及 iframe 内完整页面 | sewing-station-panel；sewing-station.html；sewing-station-view | SewingSystem；制作/研究/组装/处理、排程、测量/人台、浸泡桶；700ms 作业驱动与退出取消需单独交接 | SewingStationPanel、SewingWorkspace、MannequinDialog | P4e |
| U35 | #fishing-overlay、岸位/水域/钓组/部件/选择器/见闻/鱼获 | fishing-panel；item-assembly-display | FishingPond、FishingSession、FishingFacts、FishingFeedback；busy 守卫、离开断线损失、知识记录 | FishingPanel、FishingWaterView、FishingRigEditor | P4f |
| U36 | #hunting-overlay、制作/探索/遭遇/结果、#hunting-admission | hunting-panel；hunting-scene | Hunting、HuntingKnowledge、LivestockState；撤离/结果结算/物品消耗/收容 | HuntingPanel、HuntingAdmission | P4f |
| U37 | 正式入口内开发按钮、配方校验信息、调试跳转/主题审阅 | scene-app 调试绑定；debug-hash-router；ui-theme-review；ui-jianghu-demo | 按开发开关保留可用能力，调试显示不能成为玩家认知旁路 | DevToolsHost 或独立开发入口 | 各归属阶段；P5 收尾 |

## 范围例外与保留项

| 编号 | 文件/能力 | 处理 | 不算漏迁移的条件 |
| --- | --- | --- | --- |
| X01 | core/tile-renderer-v2、scene-animation、combat-fx-*、player-pawn-rig、地图 fallback | 保留专用渲染职责 | 只允许写入渲染器拥有的场景子树；不能继续顺带写 HUD、菜单和腰带 |
| X02 | ui-moss-prototype.html、js/ui-moss-prototype.js、独立 sewing 原型、tools 内锻造/战斗试玩 | 保留原型与参考 | 正式游戏不依赖原型脚本渲染玩家界面；后续玩法正式接入时再登记新行 |
| X03 | _archive-js/svelte 和 game-state-core | 保持归档 | 不恢复为生产依赖，不把历史试作记为迁移完成 |
| X04 | bootstrap 的灾难性加载失败提示 | 允许极小的原生 DOM 兜底 | 仅当 Svelte 包无法加载/启动时显示，不能承载正常游戏功能 |
| X05 | 浏览器剪贴板/下载能力 | 保留浏览器设施 | 可见控制与反馈属于 Svelte |

## 防漏检查表

| 检查对象 | 已纳入位置 | 每阶段复查方法 |
| --- | --- | --- |
| index.html 的 11 个 modal-* 容器 | U19、U21–U25、U29–U33 | 静态容器逐个查迁移归属；背包装备 U20 属于同一 modal |
| 动态 createElement/innerHTML 弹窗 | U15、U18、U20、U26–U28、U34–U36 | 查入口脚本、可达调用及 body 附加节点，不能只数 index.html |
| 正式子页面和 parent 桥 | U34 | 检查 sewing-station.html 和 window.parent 依赖 |
| HTML 字符串展示生成器 | U16、U19、U20、U35 | 逐个更换为展示数据/组件；把 HTML 塞进 Svelte 不算最终完成 |
| DOM 装饰、MutationObserver、事件追加 | U02、U07、U09、U10 | 检查 ui-moss-game/game-theme 与 Weather/SceneRenderer/GameLog 的间接写入 |
| 全局键盘与输入遮罩 | U11–U18 | 检查 scene-systems、dialogue-ui、scene-app 及各设施监听器 |
| 迁移期间新增功能 | 对应最近的 U 行，独立入口新增 U 行 | 开工前复查工作区增量；未接入锻造草稿不虚构成已存在正式 UI |

此清单按当前正式入口及其动态调用链划定范围。实施时若发现新入口，先补登记、数据和验收归属，再接入；不得以“此前表里没写”为由跳过。
