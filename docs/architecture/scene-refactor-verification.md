# 场景入口重构验证记录

日期：2026-11-08。对照基线是开始重构时的**工作区文件**，包含用户此前未提交的改动，不以 Git HEAD 代替实际基线。

## 完成范围

- `js/scene-app.js` 从 9,228 行变为 63 行（按去除末尾空白后的文本行计），只包含 29 个模块的初始化、接线调用。
- 整轮交战迁入 `CombatExchange`，移动、世界刻、物品事务、设施动作、角色恢复与各原生面板分别归属模块。正式入口与敌人试玩入口同步加载。
- 旧 `SceneApp` / `SceneCtx.actions` 的兼容契约、保存键、配置数据、战斗公式与结算顺序保持。已有原生与 Svelte 接入保留。
- 规则文档、职责清单、AST 守门、防退化测试、开发/构建前置检查与 GitHub 工作流已添加。后续不运行一次性抽取脚本生成模块。
- 用文本截取旧主函数的爆气、方向、沤肥、畜牧食物链、农业诊断已改为加载完整所属模块；缝纫门禁改测实际动作。药品检查验证完整物品流程。配方编辑器/战斗总览的旧源路径已更新；历史向主文件注入调试代码的脚本停用。
- 药品旧 roster 断言原本把新增的 20 件 `data_only` 先天药品算入已可用成品；检查现明确排除此类未实装物品，不改变药品数据或可用性。

## 行为与结构对照

独立只读复核用 AST 还原模块限定名、兼容工厂及拆分函数后确认：

| 对照项 | 结果 |
|---|---|
| 原 `SceneApp` 公开成员 | 91 项全部保留；对应转发/工厂内容一致 |
| 原顶层变量初始化 | 84 项全部有相同初值 |
| 原具名函数（含嵌套函数） | 268 项全部找到对应实现 |
| 原顶层接线、条件、事件绑定 | 均有对应实现，没有遗漏 |
| 展开后的 `init` | 规范化后两侧均为 39,105 字符，内容一致 |
| `BedSleep.configure` 时序 | 仅保存回调，不会提前执行玩法 |

对比时排除了并行肌肉「动力链」工作的面板变化，没有回退该项用户改动。交战末尾原本恒真的“状态刷新函数存在”检查简化为同一刷新调用。

复核发现的三项检查漏洞已经修复并加入变异测试：生成器入口不执行接线、异步/模块脚本破坏顺序，以及启动接线中直接写玩法状态。

## 已执行验证

| 批次 | 结果 | 说明 |
|---|---|---|
| `npm test` | **20 / 20 通过** | 4 项架构/变异测试；16 项正式入口、移动/跳跃、物品门禁、农业收获、交战、爆气、同速死亡、方向、沤肥、缝纫与 UI 桥回归 |
| 大范围受影响区域回归（53 个测试文件） | **194 / 197 通过** | 战斗、资源、死亡、部位、招架、设施时间、休息/睡眠、读书、制药、肌肉奖励、两套界面；3 项旧界面测试见下方 |
| `node tools/smoke-pharmacy.mjs` | **104 组断言通过** | 包含正式启动配药接线、用量 3→2→1→耗尽、拒绝退回、四途径实际耗时 |
| `node tools/verify-agriculture-acceptance.mjs` | **14 项通过** | 包含正式动作与世界刻运行测试、农业地图/存档/全链路 |
| `node tools/test-livestock-food-chain.mjs` | 通过 | 实际烹饪两条路径；生成报告内容哈希未变 |
| `node tools/audit-agriculture-runtime.mjs` | 执行完成 | 诊断输出，不等同于全项正确；零产收获与部分提交已由正式回归断言 |
| 受影响已跟踪文件 `git diff --check` | 通过 | 无空白错误 |

测试计数不可相加为独立场景总数，不同批次有重叠。`npm run test:scene-regression` 保存了大范围批次并额外纳入本轮新入口运行测试，保留失败退出状态，不跳过旧失败。GitHub 工作流已配置，本地验证不代表已在远端运行。

本地原始证据：`tmp/scene-entry-default-tests-20261108.log`、`tmp/scene-entry-regression-20261108.log`、`tmp/scene-ui-baseline-comparison-20261108.log`、`tmp/scene-pharmacy-regression-20261108.log`、`tmp/scene-agriculture-acceptance-20261108.log`。基线及原文件哈希在 `tmp/scene-entry-refactor-baseline-20261108/`；这些临时审计文件不是产品依赖。

## 尚未通过的旧界面测试

`tools/test-svelte-panels.mjs` 的以下三项在重构后与换回旧 `index.html` / `scene-app.js` 的对照运行中，在相同断言失败：

1. `approved default loadout...`：查找 `[data-muscle=shoulder_l_deltoid_l] button` 失败。
2. `P3 combat deploy...`：查找特殊技能页的 `.survival-plus-btn` 失败。
3. `P3 study controls...`：同样查找特殊技能页的 `.survival-plus-btn` 失败。

对照运行仍使用相同的其余当前模块、数据和界面资产，仅替换重构前的入口文件，因此能区分入口迁移与原有控件/测试契约问题。本轮未删除测试、强行补按钮或改变其游戏规则。大范围回归尚不能宣称全绿。

## 仍需区分的边界

- 普通徒手速度重复攻击与设计描述的既有差异、尚未投放的兵器/元技能内容，已列入 [战斗规则映射](combat-rule-map.md)，不作为重构顺带实现。
- 本轮验证主要为真实模块与 DOM 运行测试，没有新增整场真人浏览器体验或性能基准；不能据此宣称全部玩法组合或浏览器表现已经穷尽。
- 本轮完成入口职责隔离；历史模块间依赖和原有异常吞掉方式未全面重写。后续按职责继续深化，不能以此为理由把实现搬回主入口。

## 农业 A 版正式移植验证（2026-11-09）

按用户认可的 A 版替换正式农业面板，原生与 Svelte 共用渲染。共享视觉源码在 `js/agriculture/` 与 `css/agriculture.css`，同步面板包由 `tools/build-agriculture-panel.mjs` 生成。正式入口没有加载原型脚本；试玩的无限库存和即时建造仅留在原型路由。

`AgricultureActions` 新增完整事务入口 `performAgricultureAction` 与真实电池查询 `getAgricultureBatteries`，依赖正式 `SceneMovement.waitInPlace` 推进等待；接口、依赖和专项验证文件已登记在 `scene-modules.json`。主入口、startup/public 的业务边界未改变。清理、收获、扣料、退料、施工、设置和电池操作均由领域拥有者提交，视图只查询并调用完整动作。

| 检查 | 结果 |
|---|---|
| `npm test` | **20/20 通过**（架构 4、正式入口 16） |
| `npm run test:agriculture-panel` | **5/5 通过**，包含原生/Svelte、真实库存、施工与撤销、部分收获、保存失败回退、1 秒等待、页面隐藏/离开停止、实例电池电量和旧工程恢复 |
| `npm run test:scene-regression` | **200/202 通过**；下述两项既有失败，无新增失败 |
| 农业地图、农业存档、供给专项 | 全部通过 |
| 农业规则检查 | **233 通过、0 失败** |
| 农业自动验收 | **14/14 通过** |
| 原型等待与正式设施世界时间 | **9/9 通过** |
| 修改文件空白检查、正式包同步检查 | 通过 |

完整回归仍失败于 `test-svelte-panels.mjs` 的 `P3 combat deploy...` 与 `P3 study controls...`，均为 `.survival-plus-btn` 缺失，和此前农业原型几轮记录及迁移基线条目一致；没有跳过或改写这两项检查。

浏览器在独立内存验收页检查实际正式面板：修正共享系统主题对字体／按钮的覆盖后，A 版布局与视觉保持；实际完成 I06 清理、拆除工程启动、按秒等待完成与体力／疲劳更新。修复拆除任务标签缺失后重载无新控制台错误。最后恢复初始样例并选中 I06，截图 `tmp/agriculture-formal-A.png`。验收页不是玩家真实存档；未声称穷尽全部种植周期的浏览器组合。

本轮最终日志：`tmp/agriculture-port-npm-test-final.log`、`tmp/agriculture-port-special-final.log`、`tmp/agriculture-port-scene-regression-final.log`；其他专项证据为 `tmp/agriculture-port-{map,save,inspection,rules,acceptance,time}.log`。用 `tools/agriculture-formal-review.html?no_reload` 继续验收。

## 农田点击直达界面（2026-11-09）

`NPCSystem.openMenu` 完成原有位置、邻格、行动资格和设施定义校验后，对基地农田直接调用已有农业入口。已修复打开农业面板，未修复进入清理／修复面板，不发布「管理农田／查看农田」菜单。无新模块、接口或依赖，不修改农业数值、材料、时间与存档规则。

`npm test` 20/20 通过。`test-outdoor-facilities.mjs` 的地图静态检查与原生/Svelte 实际入口 3/3 通过，覆盖未清理、清理后未修复、已修复直达、异步入口期间离开、远程打开拒绝、重复进入不再耗刻及强制关闭。正式游戏 `index.html?no_reload` 中已刷新并从地图实际点击验证直接打开，截图 `tmp/agriculture-direct-entry.png`。

同步更新旧设施菜单测试的农业预期；`test-stove-menu.mjs` 4 项仍失败于原有制药断言：两项要求在原测试位置打开制药菜单，两项仍要求「查看制药台」。对照进程仅在内存中撤掉本轮新增的 7 行农田分流、加载完整原 NPC 模块，四项仍在相同制药断言失败；没有放宽或跳过这些检查。对照不写回任何生产文件。

完整场景回归 **200/202 通过**，仍只有此前已记录的 `P3 combat deploy...` / `P3 study controls...` 两项 `.survival-plus-btn` 缺失，没有新增失败。以上旧制药菜单专项的四项失败独立记录，不计入该 202 项批次，不宣称全绿。

日志：`tmp/agriculture-direct-entry-npm-test.log`、`tmp/agriculture-direct-entry-outdoor-final.log`、`tmp/agriculture-direct-entry-special.log`、`tmp/agriculture-direct-entry-legacy-baseline.log`、`tmp/agriculture-direct-entry-scene-regression.log`。

## 顶栏肌肉入口与正式图谱（2026-11-09）

新增右上角肌肉入口，原生和Svelte均沿解剖学1级门槛；未学完全隐藏，学习后状态刷新即时出现，资格失效自动关闭，陈旧请求重验资格。正式普通／头目入口共用图谱视觉正本，不加载试玩成长捷径。MusclePanel拥有生命周期和装配动作，SceneNavigation分发，SceneAccess处理移动互斥，主入口保持纯接线。

- npm test：20/20通过。
- test:muscle-ui：3/3通过，覆盖两套HUD、真实进度、开关耗刻、搜索、焦点、存档与装配回退；末次补充试玩独立进度读取后再次3/3通过。
- build:ui与check:architecture通过。
- test:scene-regression：203/205通过，包含新增入口专项；两项失败仍为test-svelte-panels.mjs的P3 combat deploy与P3 study controls，均缺失.survival-plus-btn，和迁移基线一致，无新增失败。未跳过或放宽这些检查。

浏览器在内存隔离正式验收页验证学习前按钮display:none、学到1级后出现、实际打开与关闭、七部位与真实零进度、未全通动力链禁用；全页计算字体为Microsoft YaHei，正式页无演示控件、无控制台错误。试玩共用页面的演示点亮与链槽开启也已验证。

截图：tmp/muscle-hud-entry.png、tmp/muscle-hud-formal-atlas.png。日志：tmp/muscle-hud-build.log、tmp/muscle-hud-test.log、tmp/muscle-hud-npm-test.log、tmp/muscle-hud-scene-regression.log。

## 战斗旧肌肉入口移除（2026-11-09）

用户要求统一从右上角进入。两套HTML与共用Svelte战斗面板删除肌肉分页按钮，原生／Svelte战斗刷新统一恢复skills，拒绝旧肌肉／动力链选择器。右上角入口仍由MusclePanel校验解剖学1级。两套UI包已重建；没有调整肌肉成长、奖励、动力链存档或战斗公式。

测试中的奖励总览、逐块奖励、动力链装卸和读档流程迁到真实HUD入口；新图谱的节点及搜索替代旧分页，全通效果通过原领域接口继续核对，未恢复用户删除的全通卡片。新增断言确认学会解剖学后战斗页仍没有入口，陈旧muscles状态刷新后回到招式。

npm test 20/20，入口／链槽／战斗装配／头手奖励专项20/20，两套UI构建通过。完整场景批次202/205：两项既有.survival-plus-btn失败，另有同档界面对比脚本在关闭战斗浮层后立即点击外部按钮、尚未等待视图释放的时序失败。该脚本补齐关闭后的视图刷新等待；完整test-svelte-panels.mjs复测6/8，同档对比已通过，剩余仅P3 combat deploy与P3 study controls两项既有失败。修正只涉及测试时序，未重跑其他已通过的197项，未跳过或放宽失败断言。

浏览器内存验收确认战斗标题栏只剩招式，关闭后右上角正常打开肌肉图谱，无控制台错误。截图tmp/muscle-unified-combat.png；日志tmp/muscle-unified-build.log、tmp/muscle-unified-focused.log、tmp/muscle-unified-npm-test.log、tmp/muscle-unified-regression.log、tmp/muscle-unified-panels-final.log。

## 制药台菜单回归第 5、6 项修正（2026-11-09）

按用户指定，仅修正 `test-stove-menu.mjs` 中原生与 Svelte 的 `facility entries switch from repair to use after real completion`。制药台按已确认的阶段规则检查：未修复仅「修复制药台」，修复完成且测试未注册升级项目时仅「使用制药台」，不再期待已删除的「查看制药台」。其他设施仍严格检查完整菜单，保留分次修复、真实使用、存读档和陈旧按钮重验解锁的断言。

完整流程另暴露测试站位错误：原制药台北侧是卫生间 NPC，占用格上的角色会在开关面板推进世界刻时被移开，导致后续入口失效。该测试的室内设施循环改用正式 `GameEngine.canStandAt` 选择空邻格，并明确检查关闭使用面板后仍能重新进入。未修改游戏规则、生产界面或推进时间逻辑，诊断打印已移除。

- 指定两项与原生/Svelte 制药台修复升级专项：**4/4 通过**。
- 整份 `test-stove-menu.mjs`：**2/4 通过**；指定第 5、6 项通过，第 3、4 项仍在原制药入口菜单断言失败，未顺带修改。
- `npm test`：**20/20 通过**；修改文件空白检查通过。
- `npm run test:scene-regression`：**206/208 通过**；仅剩原第 1、2 项 `P3 combat deploy...` / `P3 study controls...` 的 `.survival-plus-btn` 缺失，无新增失败。该批次不含上述设施菜单专项，两批合计仍有原第 1～4 项未修复，不能宣称全绿。

日志：`tmp/pharmacy-menu-expectations-before.log`、`tmp/pharmacy-menu-expectations-focused-final.log`、`tmp/pharmacy-menu-expectations-stove-final.log`、`tmp/pharmacy-menu-expectations-npm-test.log`、`tmp/pharmacy-menu-expectations-scene-regression.log`。

## 剩余第 1～4 项回归修正（2026-11-09）

用户继续要求一起修复前四项。修复前定向复现 **0/4 通过**：两项特殊技能测试仍点击已取消的解剖学免费加级按钮，两套设施布局测试则固定放到制药台南侧 `(14,16)`，越过 16×16 地图边界后被夹回制药台本格，不能建立邻格制药上下文。

`test-svelte-panels.mjs` 两项改为正式教材流程：确认解剖学没有免费升级／自修按钮且肌肉入口未开放，从背包选中完整教材并点击消耗，检查选中实物移除、等级准确提升至 1、总览更新和肌肉入口开放，再继续原交战装配、动力链与变招检查。没有直接赋值技能等级，也没有恢复已取消的界面按钮。

`test-stove-menu.mjs` 的设施布局循环按实际占地选择可站立且无 NPC 占用的邻格；健身设施仍按正交邻接，户外设施按已登记的完整占地检查。保留全部设施的菜单样式、农田直达、材料与时间不变等原断言。本轮仅修改这两个测试文件与验证记录，没有修改生产逻辑。

- 四项定向复测均通过。
- 整份设施菜单与教材消耗专项：**8/8 通过**，包含此前修复的第 5、6 项、保存失败回退与陈旧物品操作。
- `npm test`：**20/20 通过**。
- `npm run test:scene-regression`：**208/208 通过**，两项此前持续失败的特殊技能场景已完成全部后续断言。结合设施专项，原清单六项失败均已修复；没有跳过测试或放宽原流程校验。
- 修改文件空白检查通过，无遗留诊断打印。

最终日志：`tmp/remaining-four-before.log`、`tmp/remaining-four-special.log`、`tmp/remaining-four-npm-test.log`、`tmp/remaining-four-scene-regression.log`。

## 农业设施按钮居中修正（2026-11-10）

用户反馈「查看水路」内容偏右、与「拆除水渠」对不齐。正式页面复现确认：按钮本身为居中 flex，但旧 `.au-secondary > .au-icon:last-child` 规则将唯一水滴 SVG 识别为最后一个元素（尾部为文字节点），自动左边距达到 95px。删除共享农业 CSS 中这条已无尾部箭头使用场景的规则，正式页与原型同时修正，按钮原有高度、间距及操作规则保持。

刷新正式游戏并重新从地图进入农田，B01 两按钮实测均为 191×39px，内容中心偏移均为 0，水滴左边距为 0px；实际画面确认居中。农业包已按正本重新构建并通过同步检查；未修改生成文件或业务规则，也未为单行样式添加重复实现的测试。

`npm test` **20/20**，`npm run test:agriculture-panel` **5/5**，`npm run test:scene-regression` **208/208** 全部通过，修改文件空白检查通过。日志：`tmp/agriculture-action-align-build.log`、`tmp/agriculture-action-align-npm-test.log`、`tmp/agriculture-action-align-special.log`、`tmp/agriculture-action-align-scene-regression.log`。
