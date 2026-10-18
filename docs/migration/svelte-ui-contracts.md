# Svelte UI 接口与状态表

关联：[总方案](svelte-full-ui-migration.md) · [界面清单](svelte-ui-inventory.md)。以下表格记录迁移目标与 P0 时的既有 API。2026-10-14 已落地 carry 只读桥接、SceneHud.subscribe、AppBoot.ready/afterReady 及 managedChrome 窗口接缝；完整领域/动作服务仍待实现，实际边界见 [UI 基座说明](../../ui/README.md)。

## P2 已接入接口（2026-10-15）

| 接口 | 边界 |
| --- | --- |
| DialogueUI.attachView/getView/next/choose | 只发布正文/打字/分支/头像展示状态，队列、日志、完成回调留在原控制器 |
| SceneApp.creation.attachView/change/confirm/clampHeight | UI 保留草稿；原控制器验证、分配点数、发物品和提交角色；仅开放中的创建可提交 |
| NPCSystem.menu.attachView/choose/close | 展示字段与动作分离；请求世代及位置检查拒绝过期打开/对话 |
| SceneApp.actionMenu / runContextAction / navigate | 统一直接调用原动作与开关面板；不模拟旧按钮 |
| SceneUi.basicTooltipView/buildItemTooltipView/showTooltipView | 结构化节点只包含已允许显示的文本；字段/模块/连接按原规则查询，专业旧调用方保留到 P3/P4 |
| ResetProgressDialog.attachView/close/confirm | 失败留窗重试，成功只调用一次重载；原 open/isOpen 兼容 |
| BackgroundMusic.getEnabled/attachView | 只移交按钮；Audio 实例、偏好存储和浏览器播放重试保留 |
| SvelteInteractions | 页面级组件/焦点/输入/提示组合，dispose 幂等；原生专业 modal 只登记外层，不接管内部内容 |

## P1 已实装接口（2026-10-14）

完整主 HUD 通过 `ui=svelte-hud` 接入，`ui=svelte-carry` 保留携行对照。下文目标接口中，当前实际落地的是：

| 接口 | 当前行为 |
| --- | --- |
| SvelteHUD.bridge.getSnapshot / subscribe | body、survival、growth、carry、effects、battle、environment、journal、windows；返回过滤后的只读展示模型与 revision；订阅返回释放函数 |
| SvelteHUD.invalidate(domain?) | 单领域或全部 HUD 领域的合并刷新；不触发游戏结算 |
| GameLog.getEntries / subscribe | 返回副本、保留事件顺序；log/clear 发布通知；完整模式停止写 DOM；显示历史与旧界面相同，getLineCount 仍使用原 80 条缓冲 |
| UIWindows.subscribe / isFolded | 读取折叠状态、观察显隐/锁定/重置；managedChrome 外框不操作 Svelte 内部按钮 |
| SceneCtx.hudDebugActions | 从旧绑定中提取同一函数；组件调用一次，不通过隐藏 DOM 触发 |
| SceneApp.openUiWindowsMenu / debugPanelOpeners.uiMenu | 完整模式转发 Svelte 菜单，旧 rebuild 不覆盖组件 |
| HungerTile.getMotionMode / setMotionMode | 供 Svelte 管理菜单读写原设备偏好；绘制规则未改 |

通用 dispatch/ActionResult、独立 WindowLayout 规则/存储、全站 TooltipHost 仍是后续目标，当前不可当作已提供的 API。已迁移窗口关闭只是隐藏外框，组件页面级挂载；地图及未迁移导航/弹窗保持旧所有者。具体停止旧写入的边界和测试证据见 [ui/README.md](../../ui/README.md)。

## 状态所有权

| 状态类别 | 所有者 | Svelte 可以做什么 | 不允许做什么 |
| --- | --- | --- | --- |
| 游戏事实 | 现有 GameEngine、Survival、CharacterAttributes、InventoryEquipment 及各玩法模块 | 读取经过适配的快照；发出动作意图 | 直接修改共享对象；在 store 中维护第二份可写角色/背包/回合状态 |
| 展示模型 | 拟新增 UiBridge 的各领域适配器 | 订阅只读、经过认知过滤的数据；派生排版 | 从 DOM 文字反读数值；每帧深拷贝整个游戏 |
| 设备偏好 | WindowLayout 与音乐控制器 | 窗口坐标、关闭/收起、锁定、设备音乐选择 | 把玩家偏好当作知识解锁；布局保存时写角色存档 |
| 界面临时状态 | 当前组件或 UI 会话控制器 | 筛选、选中项、输入草稿、分页、悬停、焦点、滚动 | 将业务作业进度只存在组件生命周期中 |
| 认知与访问资格 | 现有业务规则/NPC 标记/物品识别等 | 请求过滤后的字段、类别、可执行选项 | 因组件已经加载或用户打开面板就自动解锁知识 |
| 长任务 | 游戏控制器 | 展示忙碌、进度、结果；请求开始/暂停/取消 | 在组件重复挂载时重复启动 tick、扣料、领取或保存 |
| 场景像素与命中 | 现有场景渲染器 | 提供宿主、尺寸变化、生命周期与交互路由 | 把地图帧循环接成全 UI 的刷新时钟 |

## 计划接口

UiBridge 是 UI 与当前全局模块之间的适配层，不取代游戏核心。先以 JavaScript 模块和明确的数据契约接入，是否给契约增加 TypeScript 校验在 P1 构建任务落地；不要求为 UI 迁移重写全仓库语言。

| 计划接口 | 输入/输出 | 行为约束 | 替代或衔接的当前能力 |
| --- | --- | --- | --- |
| UiBridge.getSnapshot(domain) | 领域名 → 只读展示对象，含 revision | 不返回可修改的业务对象；未知字段不携带秘密值 | 分散的 getState、格式化和 DOM 更新 |
| UiBridge.subscribe(domain, listener) | 回调接收同领域快照；返回 dispose | 立即给出当前快照；同一 revision 不重复通知；卸载可清理 | 当前没有统一多订阅总线；SceneHud 仅单 handler |
| UiBridge.dispatch(action, payload) | 返回 Promise<ActionResult> | 调用原守卫与动作；按钮/快捷键/菜单走同一入口 | SceneApp、SceneCtx.actions、各玩法控制器 |
| ActionResult | ok；公开的 reason/messageKey/vars；必要的 result | 失败原因不泄露未知玩法；不改变原逻辑耗时；不额外执行一次 tick | 现有返回值不统一，适配器规范化 |
| UiBridge.invalidate(domains, reason) | 领域集合 | 一次业务结算完成后发布；同批次合并；日志保留每条事件顺序 | SceneHud.refresh、各 refreshIfOpen、业务事件 |
| UiRuntime.ready | Promise 或等价明确的就绪信号 | 配置、字典、地图、读档及动作接线完成才放行交互 | AppBoot.afterStart 不能独自证明就绪 |
| UiRuntime.dispose | 释放订阅、监听器与宿主连接 | 不自动清空存档或取消所有后台游戏作业 | 各模块目前生命周期分散 |
| KnowledgeView | 类别许可、字段披露级别、可见操作集合 | 适配器先过滤，再交给组件；默认未知、已知但数据缺失两者分开 | shouldShow*、物品等级、设施/配方/观测条件 |
| WindowLayout | 注册/结束注册/显隐/位置/收起/锁定/重置 | 保持现有 ID 与存储语义；注册结束前不删尚未注册条目 | UIWindows 的非 DOM 规则提取后复用 |
| OverlayService | 打开/关闭/置顶/恢复焦点/输入阻挡 | 外层只能关闭自己，最上层优先处理 Escape；已知业务关闭语义交回控制器 | 分散 modal 标记、dialogue blocker、NPC 菜单 |

所有领域名称与动作名在新增代码中登记成有限集合。不得提供任意全局函数名调用入口，也不得让 UI 通过传入任意对象覆盖整个存档。

## 领域数据映射表

| 领域 | 当前权威来源 | 展示模型内容 | 刷新触发 | 对应界面 |
| --- | --- | --- | --- | --- |
| shell | SceneApp/SceneCtx、GameEngine、UIText | ready、序章/创角状态、当前位置公开名称、输入模式、导航项 | 启动/换图/读档/剧情 | U01、U02、U13、U17 |
| environment | GameTime.getState、Weather、NPCSystem | 可见时辰/时分、年日、天气、已获观测能力的温度 | 世界 tick、天气/地图变化、解锁、读档 | U02 |
| body | CharacterAttributes.getPartDestroy/getBodyPartDestroyMax；现有恢复提示计算 | 七部位 id/名称/概况；精确值、上限、恢复信息按规则提供 | 伤害、恢复、装备影响、知识、读档 | U03、U16 |
| survival | Survival.getState/getMood 等当前方法 | 主指标值/上限/单位、补充指标、公开异常提示 | tick、动作、Buff、读档 | U04 |
| growth | CharacterAttributes、SurvivalSkills 及 updateStatusPanel 当前资源来源 | 五属性、潜能/战斗经验、研习、属性经验 | 升级、研习、装备、经验、读档 | U05、U23 |
| carry | CharacterAttributes.getCarryCapacity；InventoryEquipment.getCurrentCarryWeight；现有体重来源 | 负重/容量/剩余，体重单独字段 | 物品、装备、属性、生存变化 | U06 |
| effects/battle | BuffSystem、CombatEngagement、Survival、InventoryEquipment、PharmacyEffects.getInfo | 可见效果、底气/眩晕/疼痛/药瘾/毒性及相关性 | 效果/交战变化、tick、读档 | U07、U08 |
| journal | GameLog 内部 lines；目前公开接口只有 log/clear/getLineCount 等 | 有序公开条目、类型、允许的时间标签；新增读取/订阅接口 | 追加/清空/认知变化 | U09 |
| windows | UIWindows 规则/布局存储；SceneCtx/HUD 剧情门控 | 已知窗口列表、有效可见性、偏好、位置、折叠、锁定 | 注册、拖动、重置、门控、视口变化 | U10 |
| actions/quickbelt | SceneCtx 动作上下文、InventoryEquipment 槽位来源 | 可见动作、禁用原因、固定动作槽、可见物品与来源引用 | 位置/动作/物品/知识变化 | U11、U12、U17 |
| dialogue/npc | DialogueUI 流程、NPCSystem、EntityAppearance、DialoguePawn | 公开说话者、正文、可选项、头像、交互阻挡；不暴露未播放剧情 | 开始/推进/选项/结束/异步 NPC 数据 | U14、U15 |
| itemDetails | InventoryEquipment、ItemInfoModules、ItemFieldDisplayRules、ItemAssemblyDisplay | 识别后名称/描述/字段/模块/连接树；输出结构化数据 | 选中实例变化、认知、装备及消耗 | U16、U19、U20、U35 |
| inventory/equipment | InventoryEquipment、InventoryHelpers、ItemAssembly | 容器、实例身份、数量/耐久/次数、槽位、可用动作 | 取放/使用/装卸/产出/读档 | U19–U21 |
| skills | CombatSkills、CombatVariants、Muscles、SurvivalSkills 与 scene-app 现有编辑状态 | 分类、已知技能、招式序列、肢体装配、被动、升级条件 | 学习/升级/装配/属性/读档 | U22、U23 |
| saves | SaveSystem.getStatus、导入/导出结果 | 保存状态、异步 busy、公开错误；输入草稿只在 SavePanel | 保存完成、读档开始/结束/失败 | U24 |
| warehouse/facilities | HideoutWarehouse、FacilityLabor、FacilityUnlock、CookingRepair | 物资、建设项目、投入清单/回执、作业状态、观测工具 | 投入/工作/领取/暂停/读档 | U25–U28 |
| agriculture | AgricultureMap；SceneApp.getAgricultureMapState/选项查询；AgricultureOverview 当前计算 | 网格、选格详情、任务、公开动作、供电、进度 | 动作、tick、选格、读档 | U29 |
| livestock | LivestockState；LivestockPanel 当前派生规则；Hunting 收容入口 | 区域、动物、模块、营养/产品/尸体、可执行操作 | tick、移动/喂养/建造/收获/收容/读档 | U30 |
| stations | CookingStation、PharmacyStation、RecipeSystem、StationContext、CompostSystem | 可见方法/配方/材料、作业/资源/结果、观察窗口 | 开关、投入、工作、完成、认知、读档 | U31–U33 |
| sewing | SewingSystem；SewingStationPanel.snapshot/refill/installBucket 的业务部分 | 配方/研究、实例、计划、作业、人台/测量、浸泡桶 | 作业 step、材料、选择、观测/装配 | U34 |
| fishing/hunting | FishingPond/Session/Facts/Feedback；Hunting/Knowledge/Scene | 领域已过滤的现场信息、选择、进度、结果、公开记录 | 一次行动完成、异步结果、离开、收容 | U35、U36 |

## 动作路由与提取表

“提取”表示把当前函数中的业务段变成可调用控制器，不改其判断和结算顺序。动作仍需在执行时重新检查条件，不能只相信按钮渲染时的 enabled 值。

| 动作组 | 当前入口/规则 | 迁移动作 | 特别约束 |
| --- | --- | --- | --- |
| 移动、转向、攻击、等待 | SceneCtx.actions；SceneSystems；CombatWorld/CombatPipeline | 适配现有意图入口，统一输入阻挡 | 保留体力、战斗、剧情、昏迷、忙碌守卫；转向不可凭空增加 tick |
| 面板开关 | SceneApp.open* 与各 Panel.open/close | 提取“开关业务”和“DOM 显隐”两段 | 某些开关有耗时、停止/恢复操作；不可全部改成单纯 boolean |
| 玩家动作和固定槽 | SceneCtx.actions；SceneApp.executeQuickBarPinnedSlot/clearQuickBarPinSlot | 显示公开命令 ID，路由到原动作 | 固定内容/位置变化不能复制出第二套动作定义 |
| 物品使用/穿戴 | SceneApp.tryUseItemFromContainer/tryEquipItemFromContainer/tryUseQuickBeltDigit | 直接适配；其他背包按钮抽出原闭包业务段 | 执行前复核实例/容器引用；保留药物途径、次数、耗时、失败退回和溢出处理 |
| 物品连接、装备模块 | ItemAssembly、InventoryEquipment；openModulePicker 的处理函数 | 提取控制器，组件只提交实例/槽位与操作 | 一次成功只扣一次；不直接篡改实例树 |
| 创建角色 | initCreationUI 的最终确认逻辑 | 提取校验与提交，草稿属于 UI | 最终提交一次，保留序章/标记/初始状态写入顺序 |
| 对话、NPC | DialogueUI 的推进和选项回调；NPCSystem.openMenu 的业务分支 | 保留流程控制，替换视图；NPC 菜单选项提取为公开命令 | 异步返回时验证会话仍有效，关闭后不自动重新弹出 |
| 技能/招式/被动/研习 | scene-app.renderCombatModal/openMovePicker/技能行按钮中的原处理 | 按技能、装配、研习分组提取 | 学习成本与可用招式由业务模块核验，不在组件计算后直接写状态 |
| 保存/导入/导出/清空 | SaveSystem.saveNow/exportSaveCode/importSaveCode/clearAllLocalProgress | 适配现有方法；复制码属于浏览器交互 | 忙碌时防重复；失败显示原因；清空成功才重载；密码不进日志/布局存储 |
| 农业 | SceneApp.tryAgricultureAction、自动 tick 开关 | 直接适配公开入口 | 网格可视化不得直接 mutate getAgricultureMapStateMutable 返回对象 |
| 畜牧 | LivestockPanel 的 do*/collect*/giveItems/trySpendStamina 等与 LivestockState | 先提取 UI 文件内的体力/奖励/物资结算 | 仅调用低层方法可能漏扣费/经验，必须整体保留原动作语义 |
| 仓库、设施劳动/解锁 | HideoutWarehousePanel、FacilityLabor、FacilityUnlock | 提取计时、投入、保存与回执控制器 | suspendForLoad、嵌入项目切换、失败恢复不能丢 |
| 烹饪/制药 | SceneApp.tryCookAtStation/tryPharmacyAtStation/tryCompoundAtStation；加燃料/水处理 | 复用入口；抽出仍在面板中的资源动作 | 距离、工位、配件、已知配方、正在制作由业务核验 |
| 沤肥 | CompostPanel 内投入/领取/熟练度/观察处理；CompostSystem | 将混合业务提取为 CompostController | 观察时机、开关耗时、批次阶段、领取原子性保持 |
| 缝纫 | SewingSystem.start/step/cancel；SewingStationPanel 的补料、装配、测量路径 | 控制器统一驱动作业，替代 parent 依赖 | UI 卸载和业务离开分开；保存失败退料逻辑保留 |
| 钓鱼/狩猎 | Panel 中 action 路由、领域状态机与守卫 | 提取命令路由与结果订阅，视图重新组件化 | 保留忙碌、退出代价、收获/放流/收容；不能多执行一次回合 |
| 音乐 | BackgroundMusic.setEnabled | 保留唯一 Audio 实例；增加读取/通知或桥接 | 不再由音乐模块直接抓取/改写按钮；交互解锁播放保留 |

## 共用组件表

| 组件/服务 | 共用内容 | 不应承担 | 首次使用 |
| --- | --- | --- | --- |
| PanelFrame | C 版完整材质、标题、关闭/收起、拖动把手、焦点态 | 游戏值计算和认知判断 | P1 |
| WindowLayout | 布局、夹回视口、设备存储、注册屏障、锁定 | 插入 Svelte 子节点；游戏知识持久化 | P1 |
| MetricRow、ProgressTrack、StatGrid | 标签、值、单位、精度与状态样式 | 用 0 代替未知；所有进度都按“越高越好”着色 | P1 |
| MorePopover、Menu | 现有补充信息、窗口列表、键盘导航、点击外部关闭 | 未知功能的灰色占位 | P1/P2 |
| ModalFrame、OverlayHost | 遮罩、焦点管理、关闭按钮、Escape、滚动 | 替业务决定退出是否扣时/取消工作 | P2 |
| TooltipHost、ItemDetails、ItemAssemblyTree | 定位、触摸/键盘查看、结构化字段与部件 | 再调用旧 HTML 插入器作为最终实现 | P2 |
| ChoiceList、Tabs、SearchList、Pager | 选择、筛选、分页、空状态 | 持有所有背包/世界可写状态 | P2/P3 |
| ItemSlot、ContainerView、MaterialPicker | 实例身份、数量、选中状态、可执行选择 | 扣物品、重建实例、绕过容量限制 | P3 |
| JobProgress、ActionFeedback | 忙碌/进度/失败/完成结果 | 启动世界 tick 或在渲染时领取产物 | P4 |
| FacilityUnlockPanel、MaterialContribution | 独立/嵌入装配、选材、回执 | 修改设施配置或重算材料消耗规则 | P4a |
| UiText 适配 | UIText.t 及现有字典键，文本作为组件数据 | 对 Svelte 子树运行 UIText.applyDom | P1 |

## 认知与显隐表

| 信息 | 当前规则 | 迁移后必须保持 |
| --- | --- | --- |
| 分类 | SceneCtx.setLeftHudBlockVisibilityRule / shouldShowLeftHudBlock；limbs、survival、attrs、resources、carry、buff_hud、combat_resources、journal；另有 quick_belt 与历史 role | 未知分类无窗口、无管理入口、无占位；游戏门控不覆盖玩家关闭偏好；不恢复已取消的人物介绍窗 |
| 成长组合 | attrs 或 resources 可使窗口出现 | 只显示对应已知部分；不能因潜能已知而露出全部属性经验 |
| 生存与身体细节 | setSurvivalMetricVisibilityRule / shouldShowSurvivalMetric；body_detail、satiety、thirst、stamina、energy、fatigue、nutrition、mood、dirtyness、weight、time、date、weather | 精确值隐藏时，恢复 tick、条宽、title、aria 文案与补充信息也不泄露；身体仍可显示已允许的概况 |
| 环境 | HUD.isTimeHudVisible；time/date/weather；日历 observation_calendar_unlocked；温度 observation_temperature_unlocked | 按维度显示；未取得温度观测能力不显示精确温度；原有“湿度暂未开放”属于已设计内容，不在本次新造解锁 |
| 战斗窗口 | combat_resources 且交战或异常相关 | 隐藏无关窗口；已关闭偏好继续有效；异常数值依然来自真实模块 |
| 物品 | InventoryEquipment 识别等级；ItemFieldDisplayRules、ItemInfoModules、ItemAssemblyDisplay | 列表/详情/tooltip/快捷菜单/材料选择使用同一识别结果 |
| 配方、设施、技能 | 当前 known recipe、技能条件、FacilityUnlock、NPC 标记 | 知识不可见与“已知但不可执行”分开；后者才可按原设计显示禁用理由 |
| 钓鱼、狩猎 | FishingFacts/Feedback、HuntingKnowledge 及领域公开模型 | 不显示未观测深度、鱼情、隐藏概率或未获知遭遇信息 |
| 日志和历史 | GameLog 与领域公开记录；主日志目前用系统时钟，顶栏使用 GameTime | 未知 time 隐藏主日志时间标签；保留两种时钟的既有区别；其他专业记录沿用领域知识规则；不直接输出内部对象作文本 |
| 开关/读档时序 | 门控可能在剧情推进、切图、读档时改变 | 先刷新知识过滤，再发布 UI 快照；收回知识时关闭相关浮层并清除旧提示 |

有效可见性为“游戏许可 × 当前情境许可 × 玩家显隐偏好 × 剧情层许可”。同一类别注册时保留 stable ID。unknown、known-but-unavailable、known-and-available 分开表达；未知数据不传递精确数值再靠 CSS 隐藏。这里是游戏信息披露约束，不宣称浏览器客户端能防止查看源码。

当前 shouldShow* 在未配置规则或规则抛错时返回 true。迁移时先把目前明确默认公开的项目登记为公开，保持既有玩法；新增字段没有登记或规则执行失败时按未知处理。这个错误回退调整属于 P1 的显式接口变化，必须用 F03 验证，不能笼统声称旧接口已经“默认隐藏”。

## 生命周期、刷新与输入表

| 场景 | 迁移规则 | 验收重点 |
| --- | --- | --- |
| 冷启动 | 启动壳可先显示；所有模块/字典/地图/读档/动作接线就绪后发布首份游戏快照 | 无默认数值或未解锁栏闪现；afterStart 不当作数据就绪 |
| 部分迁移 | 每个旧刷新通道由一个路由持有；未迁移部分走旧实现，已迁移部分发布数据 | 无两个所有者写同一 DOM；不能只包装后仍执行旧整块 updateStatusPanel |
| 发布刷新 | 对一次完成的动作集中收集受影响领域，再批量通知 | 背包/负重/状态一致；日志事件不可因合并刷新而丢失 |
| 非 UI 动作 | tick、NPC 剧情、Buff、自动作业、读档也必须失效相应领域 | 不能只有点击 Svelte 按钮才刷新 |
| 组件卸载 | 清理订阅、指针捕获、监听器、观察器；请求失效后不回写 | 重开 20 次不会增加事件数量；异步结果不重新打开已关闭窗口 |
| 游戏作业 | 生命周期由业务控制器决定；关闭动作显式执行当前取消/暂停规则 | UI 重挂不会额外取消作业；真实离开也不能漏掉取消/损失 |
| 输入 | 顶层确认/弹窗/对话优先；输入框不触发世界键；一次按键只路由一次 | WASD/方向键/斜向键、空格、1–9、Escape、Tab；长按规则保持 |
| 窗口拖动 | 布局服务写外框几何或交给组件统一写入；内部节点只由组件拥有 | 按钮点击不误拖；锁定、pointercancel、窗口缩放、窄屏滚动正常 |
| 场景挂载 | Renderer 拥有宿主内部 Canvas/地图 fallback；resize 与销毁只绑定一次 | 游戏面板开关不重置地图，不生成双 Canvas/双动画循环 |
| 文案与装饰 | 组件输出完整最终节点；老 applyDom、MutationObserver、game-theme 装饰跳过已迁移子树 | 字体、图标、颜色和日志功能保持；没有异步装饰反复重排 |

## 存档与设备存储表

| 项目 | 当前键/结构 | 迁移策略 | 检查 |
| --- | --- | --- | --- |
| 本地进度 | cabi_realtime_save_v1，由 SaveSystem 管理 | 保留现有格式与版本/世代逻辑；UI 迁移本身不升级存档 schema | 老档可读；导出再导入业务字段等价 |
| 游戏快照 | schemaVersion、saveGeneration、savedAt、time、weather、player、buffs、compost、agriculture_map、hideout_warehouse、livestock、hunting、fishing、fishing_pond、muscles、combat_engagement | 以 save-system.buildSnapshot/applySnapshot 当前定义为准，保留所有领域，不在 UI 重写序列化 | 进行中制作、物品实例、农业/畜牧、专业玩法、交战及解锁恢复 |
| player 内容 | engine、characterAttributes、survival、inventoryEquipment、gathering、entityAppearance、npcDemo、sceneUi | 维持原模块恢复顺序，不能只恢复画面当前显示的字段 | 原角色、坐标、物品、知识和外观一致 |
| player.sceneUi | action_bar_slots、facing_dir、cooking_station、cooking_temp_stations、known_cooking_recipe_ids、known_recipe_ids_by_system、pharmacy_station、pharmacy_effects | 名字叫 sceneUi 也可能是业务状态；逐字段沿用，不能因“UI 重写”删掉；旧兼容字段继续由 SaveSystem 处理 | 固定动作槽、朝向、已知配方、燃料、水、配件、活动制作与临时站点 |
| NPC 进度 | cabi_demo_flags_v1、cabi_demo_triggered_entries_v1；快照 npcDemo | 保留原恢复与清空路径 | 序章、设施、观测工具、一次性事件不重置 |
| 当前 C 布局 | ui_windows_moss_c_v1；version=1、lock、windows | 兼容读取/写入；保留 x/y/w/h/visible/minimized/folded/barX/barY；按紧凑尺寸和视口校验 | 位置、折叠、关闭、锁定跨刷新与迁移保持 |
| 老布局 | ui_windows_v1 | 保持现有首次转换规则：偏好/锁定迁移，不搬旧像素坐标；不删除旧键 | attrs/resources/attr-exp 合并成长不产生重复窗口 |
| 窗口 ID | win-limbs、win-survival、win-attrs、win-carry、win-buff、win-battle-resources、win-log、win-time 等 | ID 保持；win-role/win-resources/win-attr-exp 兼容别名不进菜单；其余 anchored 层也登记 | 结束注册前不清理暂未挂载 ID；剧情 hideLayer/restoreLayer 继续可用 |
| 音乐 | sexting-reborn.bgm.enabled | 保留设备偏好，不随换角色重置 | 重载保留；单 Audio；不可播放时等待用户交互 |
| 旧日志位置 | game_log_panel_pos | 沿用旧键退役处理，布局统一归窗口系统 | 不复活旧窄条布局 |
| UI 草稿 | 搜索、分页、选中项、存档账号/密码输入等 | 默认仅会话内；不新增角色存档字段；密码不持久化 | 换档/清空重置草稿，选中实例失效后安全清除 |
| 清空存档 | SaveSystem.clearAllLocalProgress | 原进度清理范围与成功/失败行为保持；不顺带抹除设备布局/音乐 | 清空失败不重新加载；取消不写存储 |

## 构建与目录方案

| 项目 | 计划 | 约束 |
| --- | --- | --- |
| 框架 | Svelte 5 客户端组件 | 无需 SvelteKit、服务端渲染或新路由体系；实际依赖版本在 P1 锁定 |
| 目录 | ui/src/app、components、features、bridge、styles | 当前尚不存在；文件归属随界面编号登记 |
| 编译 | Vite 编译 UI 入口为可由现有静态服务器加载的 JS/CSS | 保留同源资源和当前 8000 端口；开发监听与 no_reload 兼容；生成物位置和提交策略在 P1-01 固定 |
| 挂载 | 显式 mount/unmount；过渡期按独占区域挂载，最终收敛 GameApp | 参考 [Svelte imperative API](https://svelte.dev/docs/svelte/imperative-component-api)；不调用组件渲染来推进业务 |
| 样式 | 先复用完整现有材质 CSS 与标记结构，明确组件作用域 | 不引入默认组件库覆盖；最终调整组织方式也必须通过视觉对照 |
| 开发命令 | 计划增加 build:ui、check:ui 和配套开发监听 | 保留现有食品、农业、锻造等 scripts；不能覆盖当前 package.json 中的并行改动 |
| 清理目标 | 正式加载链不含 React、原型 UI、已替代 DOM 拼装器 | 历史原型、归档及地图渲染可保留在仓库；清理以依赖调用证据为准 |

## P3 已落地接缝（2026-10-15）

- `SceneApp.panelApi` 保留面板开关耗时、当前选择、原部署/升级/领取/物品使用及恢复后的刷新；不从隐藏按钮代理业务。
- `runtime/panels.js` 在 AppBoot.afterReady 后发布 5 个面板模型；替换原子树，SceneHud 的背包/状态通知转入对应查询；关闭面板不订阅额外计时器。
- `inventory-panels.js` 只发布已过滤的文字/说明节点与操作定位 token，不把完整模板或可写物品实例放进组件模型。执行前重新核对实例、容器、位置；装配沿用 ItemAssembly 验证与原失败退回。
- `combat-panel.js` 沿用当前 CombatSkills/CombatVariants/Muscles 和 safeSetCombatState；招式选择绑定肢体、已部署技能和槽位，提交前重验解锁与槽数。
- `skill-save-panels.js` 沿用研习、升级与 SaveSystem；保存异步请求单次在途，窗口会话标识阻止迟到结果回写新的窗口，关闭不自动取消 SaveSystem 已接受的业务事务；密码与存档草稿仅留在会话内，页面释放时清除。
- 组件直接复用原面板 ID、类名、结构、文案与全部既有 CSS；没有引入 HTML 解析、@html 或新增设计样式。原生对照的渲染代码暂留至 P5，完整模式不写入 Svelte 子树。

## P4a 已实现接缝（2026-10-15）

| 控制器 | 视图订阅/命令 | 所有者与约束 |
| --- | --- | --- |
| FacilityLaborPanel | attachView/getView、act、open/close/dismiss | 原控制器持有劳动计时器，组件无 interval；隐藏页面、失败、读档、卸载均停止；保存失败阻止离开 |
| FacilityUnlockPanel / CookingRepairPanel | attachView/getView、select/act、open/close、mountView/unmount、hasReceipt | 独立与工具/仓库嵌入共用会话；原 FacilityUnlock 重新校验库存与位置并结算；结构化展示不暴露材料内部点数；回执继续保留 |
| ToolbenchPanel | attachView、choose、open/close/refresh | 日历/温度计与未开放湿度计；切换项目释放旧材料会话；交付成功刷新 HUD |
| HideoutWarehousePanel | attachView/getView、act、原 open/close/render/suspendForLoad | 原控制器保留路线、保存与施工计时；组件独占节点；动作使用实例/数量凭据拒绝过期按钮；读档保持暂停 |

组合根：`ui/src/runtime/facilities.js`。`attachView` 返回释放函数，页面卸载停止作业并释放订阅/组件；读档使用原 SaveSystem 的暂停与关闭顺序。原生对照渲染保留到 P5，完整模式不运行其子树写入。
