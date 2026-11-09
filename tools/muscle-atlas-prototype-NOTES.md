# 肌肉／动力链抽象图谱试玩

2026-11-09。待评价：抽象人形、金色动力链和肌肉点阵，是否符合游戏画风，能否清楚表达逐块点亮和整部位开槽。

## 入口与范围

`npm run prototype:gym`，打开 `http://127.0.0.1:8049/tools/gym-prototype.html?no_reload&atlas=1`。沿原健身房试玩，肌群按钮也打开新界面。用户要求「出一版」并明确人体图抽象化，因此只制作这一版，不附三个风格变体。

只改独立试玩的展示，不替换正式两套界面。入口仍使用原内存存储隔离；没有写正式角色、修改奖励数值或增加成长来源。`atlas=1` 注入展示进度；普通入口沿本次健身房试玩实际进度。底栏所有演示／重置只影响本页内存。

## 呈现

- 人形由代码原生 SVG 几何面组成，沿墨绿、暖金与刻线风格。用户否定写实解剖方向后，未采用生成的解剖图片。
- 布局参考 Cyberpunk 2077 的身体中心和部位入口、Deus Ex 的部位／详情层级、Grim Dawn 的节点点亮反馈，未使用这些游戏的素材或规则。
- 七部位、22群、478条均从 Muscles 查询；选择部位／肌群／节点，查看百分比、逐块和全通奖励。支持组内名称查找、全身已得奖励总览、正背面切换。
- 点亮和开槽演示具有流光、光环扩散与粒子反馈。特效可关闭，默认遵循减弱动态设置，页面隐藏停止绘制，关闭界面清理动画、计时器和观察者。
- 动力链装卸调用既有 `setChainPassive`，同侧全通、适用范围、槽已占用、效果全局唯一均沿正式规则。隐藏奖励不进入公开显示。

## 本轮验证

- 浏览器检查 99.900% → 100%、47/48 → 48/48、总槽数 2/7 → 3/7，以及装配／卸下、另一侧已占用、未全通按钮禁用；查找可定位对应肌肉。
- 额外核对批量开槽、零进度、全亮 478/478 与 7/7、奖励总览、正背面切换、特效开关；浏览器无错误或警告。检查 1280×720 与 390px 窄屏，窄屏采用上下滚动布局。
- `npm test`：20/20 通过。`npm run test:scene-regression`：200/202 通过，两个失败均为架构迁移基线已登记的 `tools/test-svelte-panels.mjs` 查找 `.survival-plus-btn`，不是本页图谱入口；详见 `docs/architecture/scene-refactor-verification.md`。未跳过失败测试。
- 语法检查覆盖新图谱模块和宿主。日志：`tmp/muscle-atlas-npm-test-20261109.log`、`tmp/muscle-atlas-scene-regression-20261109.log`。

正式接入与最终视觉取舍待用户评价，不新增解锁费用、依赖连线规则或奖励。

## 同日文字精简

用户再次明确删除所有说明文字。移除装饰小标题、正背面／肌群数副标题、图谱页脚、视觉试玩标签、重复的成长与开槽状态句、成功提示浮字和总览说明；空态使用破折号，开槽状态沿节点与菱形明暗表达。保留部位／肌肉／动力链名称、数量、百分比、奖励和操作按钮。读屏标签与失败反馈保留，避免影响识别和操作。

本次浏览器验证文字移除、单块点亮及开槽状态，控制台无警告／错误；语法与空白检查通过。重新运行 `npm test`：20/20；场景回归：200/202，仍为上文两项既有 `.survival-plus-btn` 失败。日志为 `tmp/muscle-atlas-text-cleanup-test.log`、`tmp/muscle-atlas-text-cleanup-regression.log`，截图为 `tmp/muscle-atlas-no-explanations.png`。

## 同日字体与居中对齐

按用户要求沿用主游戏字体分工：正文与控件使用 `Microsoft YaHei / PingFang SC`，标题使用正式肌肉面板的 `SimSun`，数字使用 HUD 的 `Bahnschrift / Segoe UI`。删除本页原楷体与 Georgia 字体，集中为三个字体变量。

计数与分母垂直居中，下方标签相对整个计数居中；关闭按钮改为居中的 SVG 图标。部位名称、选项卡、肌群按钮、节点末行、单块奖励、全通奖励、总览、动力链选项及底栏操作均在各自区域居中排列，继续保持无说明文字。

浏览器核对 876×884 桌面与 390px 窄屏；桌面未发生横向溢出，关闭图标两轴偏移为 0，计数与标签水平偏移小于 0.02px，分母垂直偏移为 0。截图：`tmp/muscle-atlas-centered-fonts.png`。

语法与空白检查通过；`npm test` 20/20，场景回归 200/202，仍为上文两项已登记的 `.survival-plus-btn` 失败。日志：`tmp/muscle-atlas-alignment-test.log`、`tmp/muscle-atlas-alignment-regression.log`。

## 同日移除全通栏

按用户截图移除单块肌肉详情下方整块「全通」区域，包括状态、勾号、奖励占位与分隔线，并删除其专用渲染函数和样式。肌群进度仍在肌群按钮显示，奖励计算和总览继续沿现有规则。浏览器已确认移除并保留原选中的肌肉；截图为 `tmp/muscle-atlas-without-completion.png`。

语法与空白检查通过；`npm test` 20/20，场景回归 200/202，仍为基线登记的两项 `.survival-plus-btn` 失败。日志为 `tmp/muscle-atlas-remove-completion-test.log`、`tmp/muscle-atlas-remove-completion-regression.log`。

## 同日动力链卡片改版

用户否定横向列表样式后，将四个动力链改成居中双列卡片：稳定效果 ID 对应统一的 SVG 刻线图标，保留主游戏字体、墨绿金属底色与暖金边框。装配卡片高亮并显示卸下，其他肢体占用时按钮显示肢体名称与锁图标，未开放或当前槽已占用的其他选项仍沿原规则禁用。顶部小徽记跟随当前装配图标；没有增加说明段落。

缩小顶部装饰和卡片间距，当前桌面四张卡片无需滚动，低高度视口采用紧凑样式；390px 窄屏仍为双列并沿页面滚动。浏览器确认实际装配／卸下、全局占用、未全通禁用、腿部两个选项与头部空态，控制台无错误／警告。所有动作继续调用原 `setChainPassive`，奖励和门槛不变。

1000×680 视口收起重复的顶部装饰徽记，四张卡片与按钮完整可见；卡片内图标、名称与按钮中心偏移不超过 0.01px，没有横向溢出。截图为 `tmp/muscle-atlas-chain-cards.png`。

语法与空白检查通过；`npm test` 20/20，场景回归 200/202，仍为基线登记的两项 `.survival-plus-btn` 失败。日志：`tmp/muscle-atlas-chain-cards-test.log`、`tmp/muscle-atlas-chain-cards-regression.log`。

## 同日标题区美化

移除标题前方的方框「体」字及斜杠，改为七节点 SVG 徽记与上下两层标题：宋体「肌肉」、主游戏正文字体「动力链」，辅以细线与低强度暖金光晕。两行各自居中，徽记与文字块垂直居中；继续不增加说明文字。

浏览器确认当前 744px 与 390px 窄屏显示，标题没有横向溢出，徽记／标题垂直中心与上下文字水平中心偏移均为 0；控制台无警告／错误。保留原部位与肌肉选择，截图：`tmp/muscle-atlas-new-title.png`。

语法与空白检查通过；`npm test` 20/20，场景回归 200/202，仍为基线登记的两项 `.survival-plus-btn` 失败。日志：`tmp/muscle-atlas-title-test.log`、`tmp/muscle-atlas-title-regression.log`。

## 同日取消总计与改为可搜索列表

按用户要求删除标题栏的肌肉／动力链总计，以及动力链选项上方的装饰徽记。被动从双列卡片改成单列紧凑列表，保留小图标、名称、装配／卸下与同效果被其他肢体占用的状态；部位点亮进度仍在身体图与部位圆环显示。

列表增加名称搜索与清空按钮，搜索条在列表滚动时保持可用，不增加说明段落或结果总数。搜索独立于肌肉查找，切换部位清空；输入刷新保留焦点与光标，中文组词期间不重建输入框。装卸继续沿既有规则，并保留同部位的列表滚动位置与操作焦点。

浏览器验证删除项不存在、名称筛选／连续输入／无结果／清空、筛选后装配及卸下、切换部位重置搜索、他侧占用与未全通禁用；当前桌面与 390px 窄屏列表均完整显示，无横向溢出或控制台错误。截图：`tmp/muscle-atlas-chain-list.png`。

语法与空白检查通过；`npm test` 20/20，场景回归 200/202，仍为基线登记的两项 `.survival-plus-btn` 失败。日志：`tmp/muscle-atlas-chain-list-test.log`、`tmp/muscle-atlas-chain-list-regression.log`。

## 同日按正式主界面统一材质

以正式主界面 `css/ui-moss-runtime.css`、`css/ui-moss-game.css` 与战斗装配面板 `css/combat-loadout.css` 的苔绿金属框、内凹底板、暖金压边和颗粒纹理为参考，调整整页视觉。标题栏、七部位入口、分页、肌群按钮、单块节点、进度槽、奖励总览和动力链列表均增加明暗边缘与投影；选中和点亮状态使用暖金高光。图谱保持抽象 SVG，原流光／粒子及关闭特效、减弱动态设置继续生效。

沿主游戏微软雅黑／苹方正文、宋体标题、Bahnschrift／Segoe UI 数字字体。仍无说明段落、顶部总计、动力链大徽记或肌群全通说明栏。动力链维持单列搜索列表，不恢复卡片网格。本轮只修改试玩样式，没有改动成长、奖励、装配规则或正式存档。

浏览器确认主窗口、390px 窄屏与 1000×680 紧凑窗口的显示，列表搜索、清空、装配、卸下和奖励总览正常；主窗口及窄屏均无横向溢出。正式主界面参考通过内存隔离验收页查看。主页面无控制台警告／错误；两个 iframe 尺寸检查页在浏览器检查期间各记录一次无来源的 MutationObserver 参数错误，试玩加载代码无此观察器，未见显示或交互受影响。截图：`tmp/muscle-atlas-main-style.png`、`tmp/muscle-atlas-main-style-muscles.png`。

语法检查通过；`npm test` 20/20，完整场景回归 200/202。两项失败仍是既有 `test-svelte-panels.mjs` 的 `P3 combat deploy...` 与 `P3 study controls...` 找不到 `.survival-plus-btn`，与场景迁移验证记录一致，没有新增失败。日志：`tmp/muscle-atlas-main-style-test.log`、`tmp/muscle-atlas-main-style-regression.log`。

## 同日移除右侧部位标题与圆环

按用户截图删除右侧整个部位标题区，包括名称、装配名称、进度圆环与下方分隔线；删除对应专用样式及各尺寸覆盖，切换栏上方不保留原占位。右侧直接从「肌肉／动力链／奖励总览」开始，左侧部位入口仍显示各自进度和装配状态。

浏览器确认肌肉和动力链两页均无该标题区、肌肉节点仍完整、内容无横向溢出，控制台无错误／警告；保留用户原先的全部点亮情境、左手和动力链视图。截图：`tmp/muscle-atlas-without-part-header.png`。

语法检查通过，`npm test` 20/20，完整场景回归 200/202，仍仅为已登记的两项 `.survival-plus-btn` 缺失。日志：`tmp/muscle-atlas-remove-header-test.log`、`tmp/muscle-atlas-remove-header-regression.log`。

## 同日调整七部位按钮排版

按用户对头部按钮的反馈统一七部位入口：名称独立居中，完成标记从名称行移到右上角；进度拆为当前值、分隔符与总数，使用同一基线及固定间距。按钮按窗口尺寸采用固定宽高，不再整体缩放文字；已装配的动力链名称置于按钮下方，不改变按钮尺寸。仍沿主游戏字体和现有金属材质，没有新增说明文字。

浏览器确认七个按钮名称／进度水平中心误差低于 0.01px，390px 窄屏全亮时没有按钮重叠或文字溢出；点击头部正常显示97条头部肌肉，返回原左手动力链视图。主页面控制台无错误／警告。截图：`tmp/muscle-atlas-body-labels.png`。

语法检查通过，`npm test` 20/20，完整场景回归 200/202。仍仅为既有 `P3 combat deploy...` 与 `P3 study controls...` 的 `.survival-plus-btn` 缺失，没有新增失败。日志：`tmp/muscle-atlas-body-labels-test.log`、`tmp/muscle-atlas-body-labels-regression.log`。

## 同日核对主界面并调整动力链名称字体

用户指出「不假思索」的字体难看，要求核对正式主界面。通过内存隔离正式页面读取实际计算样式：正文及身体条名称为 `Microsoft YaHei / PingFang SC / sans-serif`、常规字重；面板标题使用 `Noto Serif CJK SC / SimSun / serif`，正式战斗界面的部分招式及动力链名称也仍用宋体。试玩原动力链列表名称为 17px、400字重的 `SimSun`，额外字距0.68px及模糊阴影。

本次将试玩动力链列表名称改为主界面正文字体，16px、400字重、正常字距，删除文字阴影。只改这类列表名称，不修改主界面字体、成长规则或装配流程。浏览器确认四个名称均使用新字体、无文字溢出及控制台警告／错误，保留全部点亮、左手动力链视图。截图：`tmp/muscle-atlas-list-font.png`。

`npm test` 20/20，完整场景回归 200/202，仍为已登记的两项 `.survival-plus-btn` 缺失，没有新增失败。日志：`tmp/muscle-atlas-list-font-test.log`、`tmp/muscle-atlas-list-font-regression.log`。

## 同日肌肉页全部统一微软雅黑

用户要求肌肉页其他文字也统一微软雅黑。标题与数字字体变量改为引用正文的 `Microsoft YaHei / PingFang SC / sans-serif`，页签标记不再单独使用系统字体。范围包括总标题、部位名称、肌肉名称、点亮数字、成长百分比、奖励数值、动力链、按钮、搜索及提示；没有改动主游戏其他页面。跨平台保留原正文回退字体。

浏览器逐页核对肌肉、动力链、奖励总览，所有文字节点计算字体均为统一字体；390px 窄屏全亮时文字与部位按钮无横向溢出。原字号、居中布局、精简文字和隐藏区域保持。

主页面控制台无错误／警告，保留原全部点亮、左手动力链视图。截图：`tmp/muscle-atlas-yahei-muscles.png`、`tmp/muscle-atlas-yahei-chain.png`。`npm test` 20/20，完整场景回归 200/202，仍为已登记的两项 `.survival-plus-btn` 缺失，无新增失败。日志：`tmp/muscle-atlas-yahei-test.log`、`tmp/muscle-atlas-yahei-regression.log`。

## 正式顶栏入口（2026-11-09）

视觉正本已迁至js/muscle-atlas-view.js和css/muscle-atlas.css，试玩通过轻量外壳继续复用。右上角正式肌肉入口仅解剖学1级以上显示，点击打开同一图谱，正式数据与演示捷径分离。全页微软雅黑、精简文字与可搜索动力链列表保持。浏览器已检查正式学习前隐藏、学习后出现、打开与关闭、未全通动力链禁用，以及试玩演示点亮仍正常。正式截图tmp/muscle-hud-entry.png、tmp/muscle-hud-formal-atlas.png。

本轮验证：入口专项3/3，npm test 20/20；完整场景回归203/205，仍为基线两项.survival-plus-btn缺失，无新增失败。末次分离试玩独立进度读取后专项再次3/3。日志见tmp/muscle-hud-*.log。

## 统一右上角入口（2026-11-09）

用户追加统一入口：战斗界面的旧肌肉分页按钮已从普通／头目HTML和共用Svelte战斗面板移除；战斗刷新将旧muscles模式归回skills，旧肌肉／动力链选择器拒绝重新打开。肌肉与动力链只从右上角进入，原解剖学1级门槛保持。
两套战斗包重建。肌肉奖励与装配界面测试改走真实HUD图谱；旧分页测试改为新图谱节点与搜索验证，不恢复已删除的全通说明区域。全通效果继续通过Muscles接口核对，已获得奖励总览与逐块效果读取实际UI。浏览器确认战斗面板只剩招式，关闭后右上角可正常打开图谱；无控制台错误。截图tmp/muscle-unified-combat.png。

验证：npm test20/20，受影响专项20/20；整套回归发现的同档界面对比测试时序已修正，该面板批次复测6/8，仅剩两项既有.survival-plus-btn失败。完整过程与日志见架构验证记录「战斗旧肌肉入口移除」。
