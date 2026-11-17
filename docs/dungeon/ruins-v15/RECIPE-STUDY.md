# V16 · 稀有资料室与配方资料台

2026-11-02。用户认可“旧工艺资料台”外观并授权完成剩余功能。本兴趣点已接入正式地牢生成、两套界面的地图交互、制作知识和正式保存。每台提供一次奖励：优先解锁范围内一项尚未掌握的配方；范围全已掌握时，按用户后续要求改给一次潜能。不发物品、熟练度或额外探索点结算加成。

## 玩家交互

1. 用户确认整次地牢出现率约3%，整次最多1间。新出征在进入时独立判定，命中后从本次可达楼层中等概率选一层（门票从高层进入时不会抽到已跳过楼层）。出现决定保存于本次出征，换层、读档及最多8次地图生成重试均不重抽；无法合法摆放时明确失败，不静默提高出现率或取消命中。
2. 复用兴趣点的相邻可达和感知检查。地图点击或附近入口打开资料台，显示批准的展开外观和“研读资料”，不提前公开未知配方清单或奖励名称。
3. 研读完成消耗1世界tick，沿既有动作节奏试调；没有额外材料、体力或技能等级门槛，世界时间的正常生存与战斗推进仍发生。打断、移动、失能或死亡不能完成研究。
4. 完成后只授予范围内一项尚未掌握的配方，显示其名称并切为资料合拢状态。同一处不能重复领取。普通查看不授予知识。
5. 范围全部已掌握时显示“这里的配方已全部掌握”和“潜能 +1500”，按钮为“研读并获得潜能”。用户指定三倍潜能兴趣点；按同为书桌类的残页书桌500点标准计算，基础奖励1500点，沿用1世界tick研读。只打开或取消不领取、不消耗。
6. 潜能成功到账后显示“已获得潜能：实际到账数”，按钮变为不可用的“已领取”，切换原有合拢外观。配方与潜能共用一次使用机会；已学到最后一项配方的这张资料台也不能再补领潜能。读档、重开窗口不重复发放。

潜能基础值读取本次出征锁定的 `content.insight.rewards.desk × 3`，配置变动不会影响正在进行的出征。沿用现有潜能发放接口及增益倍率，保存实际到账数供结果展示；没有额外探索点结算奖励。潜能、点位和时间在同笔保存中提交，保存失败一并回退。旧存档的已使用资料台保持已使用；尚未使用且范围全掌握的资料台可以领取新奖励，不补刷房间或点位。按2026-11-02确认的[死亡规则](../../design/82-death-system-and-presentation.md)，已到账潜能与配方知识在死亡后保留，只取消未结算的探索报酬；资料台已用状态不重置，不能重复领取。

选择使用楼层种子、点位身份及当前未学清单确定；在候选知识未改变时，取消或读档不能重抽。每个点的范围随生成锁定，整次出征配置也锁定；新一层仍使用本次出征的配置。

## 专用小房间

资料室为固定3×4格内部、5×6格含墙体，外圈保留一格通路。完整墙体、前方一扇木门；资料台位于后墙中央，占一格，面向屋内，台前和门内落点留空。原资料台两态、固定朝向、144px棋格与125%人物保持。正式墙地沿用共用素材，三件定稿陈设由正式生成流程摆放。

房间在其他内容分配前预留，放到不覆盖建筑或道路的空地上，检查整层连通、门前可达与独立撤离路线。不会混入敌人、搜刮容器、采集、恢复或其他潜能兴趣点；只保留资料台的一次配方／全掌握潜能奖励。其他普通敌人仍可沿正常AI移动，不将此房间设为战斗安全区。资料室完整墙体不参与随机无门、无墙或破损房抽取。

[实际地图预览](http://127.0.0.1:8044/tools/street-thug-boss-room-generation.html?no_reload&seed=study-room-v1-61&floor=1&area=%E8%B5%84%E6%96%99%E5%AE%A4)使用自然命中的固定出征种子与正式生成器；运行本地静态服务8044后可查看，不读写正式存档。用户已确认将展示的房间陈设接入正式房间。

## 配套陈设正式接入（2026-11-02）

用户提出房间偏素后，新绘旧铁档案架、旧图筒架、补面矮凳三件。沿用77号画风、几何模板和实际参考；透明原图、原生朝向、等比显示和独立阴影。内部后排左／右摆架子，左侧摆矮凳，8/12格保持通行，中央台前与门内留空。陈设不提供额外奖励或存取功能。

用户确认“接入正式房间然后提交”，本批外观与摆放正式定稿。`RuinsRecipeStudy.decorate`在其他陈设分配完成后摆放三件，统一登记到正式美术目录；各占一格阻挡移动、不额外遮挡视线，通行与资料台操作位置检查通过后才写入地图。位置、碰撞和陈设随既有地图结构保存，读档不重新投放，已经生成的旧地图保持原布局。内置image_gen原图、精确提示词、参考、尺寸和批准见[素材说明](../../../assets/dungeon/recipe-study-room-art-v1/README.md)。[查看三件素材](http://127.0.0.1:8044/tools/recipe-study-room-art-review.html)及房间搭配链接使用相同正式生成流程的独立内存试场。出现率、配方范围和一次奖励保持。

## 可视化范围编辑器

在项目目录运行 `npm run editor:recipe-study`，打开 [配方范围编辑器](http://127.0.0.1:8042/)。端口被占用时可运行 `npm run editor:recipe-study -- 8043`，使用对应端口。需要本地专用服务；直接双击 HTML 或用普通静态服务无法保存。

页面实时读取79号制作目录、物品名称、分类与各地牢范围目录，当前共63条成品（41条研究、22条一级基础）及2条中间料加工。仅研究配方可加入范围，其余可查看详情。2026-11-02已改为按地牢独立配置，替代此前单一默认范围编辑器。

- 左侧选择地牢，每个地牢独立保存范围、开关和整次出现率，同地牢各楼层共用；切换地牢保留所有未保存草稿。
- 「新增地牢配置」只需名称；默认空范围且关闭投放，或复制某个地牢的已保存范围。复制后互相独立，地牢唯一编号自动生成且保持稳定。
- 按分类、名称、材料或配方ID筛选；支持已选／未选／仅查看筛选。
- 勾选单项、查看用料和制作条件，或批量选中／移出当前结果。批量操作不影响筛选结果以外的配方。
- 可设置启用状态及整次出征0～100%的出现率；整次最多1间。开启且出现率大于0时，必须至少选一项。
- 点击「保存当前地牢」只保存当前选择的地牢，其他未保存草稿保留。已接入地图的地牢在刷新游戏并开始新出征后生效。
- 「配方分配总览」查看各配方所属地牢，支持未分配／多处共用筛选，点击地牢名称可跳转编辑。同一配方允许多个地牢投放；基础配方和中间工序不计入未分配统计。
- 总览统计所有地牢的所选范围，包含未保存草稿；关闭投放、出现率为0或尚未接入地图的配置会注明状态，不把“已分配”当成“正式可获得”。
- 「撤销当前修改」只恢复当前地牢；「重新读取」获取文件最新内容，丢弃所有草稿前提示；「导出当前范围」下载含 `id`、`name`、`recipeStudy` 的单地牢条目，导出本身不保存。

目前只有村外废墟已接入正式地图。新增条目标注「仅配置 · 未接地图」，不会创建地图、入口或敌人；将来对应地牢接入时按同一编号读取其范围。名称用于编辑器辨认，唯一编号可在导出条目中查看。

编辑器只监听本机地址。创建配置或点击保存时写入 `data/dungeon-recipe-ranges.json`；保存复用正式资料台校验、检测源文件冲突并原子替换，失败保留原文件和本页草稿。不读写玩家存档，不修改地图配置或门票；当前已接入地牢的门票单独覆写仍会提示。

实现：`tools/recipe-study-range-server.mjs`、`tools/recipe-study-range-editor.{html,css,mjs}`。验证：`npm run test:recipe-study-editor` 使用临时目录覆盖读表、分类、独立保存、空范围、复制、切换草稿、分配统计、外部冲突与写入失败；`npm run test:dungeon-recipe-ranges` 通过正式加载器验证按编号读取、出征锁定及旧档兼容。新增测试地牢仅存在于测试数据，不写入项目正式目录。

## 手动配置

编辑 [data/dungeon-recipe-ranges.json](../../../data/dungeon-recipe-ranges.json) 中目标地牢条目的 `recipeStudy`。目录结构为 `{ "version": 2, "dungeons": [{ "id": "village_ruins", "name": "村外废墟", "recipeStudy": { ... } }] }`。

[data/dungeon-config.json](../../../data/dungeon-config.json) 通过 `recipeStudyRangesSource` 指向此目录；正式加载器按该地牢的 `id` 精确匹配范围，再应用门票覆写。该文件不再保留第二份 `content.recipeStudy`，避免双处编辑。`content.version` 为16，范围目录为version 2。V15快照保持原每层数量规则，V16保存整次出征的出现计划。找不到对应编号或目录无效会明确报错，不借用其他地牢的范围。

| 字段 | 含义 | 当前值／范围 |
|---|---|---|
| `enabled` | 是否投放资料台 | `true` |
| `chance` | 整次出征出现率 | 默认0.03；允许0～1，0不生成 |
| `recipeIds` | 可以授予的完整配方ID清单 | 从79号revision 11的41项研究配方中按地牢勾选 |

`chance`控制整次出征是否有资料室，命中后最多生成1间。不同地牢各自配置，已配置的配方范围保持；不再使用每层数量设置。

只解锁维修钳的例子：

```json
{
  "enabled": true,
  "chance": 0.03,
  "recipeIds": ["manufacturing.tool_repair_pliers"]
}
```

从指定几项中解锁一项时，把那些配方ID都放入`recipeIds`。这里使用完整配方ID，不能填物品ID、分类名或兴趣点来源名。重复、拼错、非研究配方、开启时空范围会明确报错，不自动回退到全配方。

门票可在既有`content`覆写入口里设置同结构的`recipeStudy`；清单整体替换，不与基础清单合并。指定范围只影响新出征，已生成地图和旧出征保持原样。

新出征保存 `dungeonId` 和解析后的完整内容快照；续层和读档继续使用快照，不重新读取最新范围。缺少 `dungeonId` 的旧出征继续兼容，已有配方仍属于玩家的永久知识，不按地牢拆开保存。

## 知识与兼容

`ManufacturingKnowledge`保存已掌握的完整配方ID。63条目录从79号正本生成，其中22条基础配方仅按对应生活技能1级掌握，其余41条必须显式研究授予。高等级、拥有实物或普通查看不授予高级配方。

正式存档新增可缺省的`manufacturing_knowledge`字段。缺字段的旧档从空研究知识开始，不导入独立试玩或赠送配方。已有套索制作知识继续识别；从资料台新学套索后，既有狩猎制品入口可制作套索，但不会因此授予捕猎战术知识。

配方与点位使用标记在同一正式原子保存中提交；失败还原知识、点位、数量状态和当前tick。死亡清除随身物品时知识保留。V14及更早出征不补刷资料台；V15旧出征继续原每层数量和原布局，V16新出征使用稀有资料室，均不在读档时重新抽取。

本轮接入知识获取，不扩展为完整制造执行器、实物拆研或样本研究已接入。现有独立制造试玩继续隔离，不读取正式知识或存档；未来制作执行器应读取同一知识服务。其余制造研究来源仍为设计配表，不据本次通用资料台投放宣称各专业工作角已投放。

## 美术与实现

批准的两张PNG、裁切、原生朝向、接地锚点和144px下0.12等比倍率保持。地图和资料窗口共用两态，固定原生朝向，不自动镜像或拉伸。素材批准及来源见[素材说明](../../../assets/dungeon/recipe-study-point-v1/README.md)。

- `js/dungeon/recipe-study.js`：配置校验、室内合法摆放、候选范围、单项配方／全掌握潜能授予与互斥回执。
- `js/manufacturing-knowledge.js`：正式知识与旧套索兼容。
- `js/dungeon/runtime.js`、`panel.js`、`save-system.js`：正式交互和同笔保存。
- `tools/build-manufacturing-knowledge.mjs`：由79号正本生成目录；`--check`校验是否同步。
- `tools/build-grid-scene-catalog.mjs`：从批准的素材登记同步正式地图目录。

## 验证

陈设接入的提交验证使用独立索引导出的完整版本运行，覆盖正式入口、两套奖励交互、房间保存和碰撞、范围编辑器12项检查，以及40张强制资料室／头目地图的通行。三张PNG与批准哈希一致，正式绘制保持原比例；[正式房间画面](../../../reference/recipe-study-room-art-v1/room-runtime.png)与[提交检查记录](../../../reference/recipe-study-room-art-v1/runtime-checks.json)留档。当前已编辑的8项配方范围原样保留。

稀有资料室：`node tools/test-recipe-study-room.mjs`覆盖100000次出征抽样（3.041%）、四层最多一间、门票起始楼层、生成重试、保存／读档、修改配置不影响旧出征、完整墙门与通行、排除其他奖励以及实际研读。

专项：`node tools/test-recipe-study-point.mjs`及加`--svelte`，覆盖真实按钮、范围替换、只解锁一项、未学筛选、不泄露未知配方、1tick、取消／离格／受击／失能、两类奖励保存失败完整回退、全已学三倍书桌潜能、增益实际到账、回执校验、领取互斥、读档防重复、死亡、旧档及旧出征跨层。

2026-11-13重试诊断更正：此前Svelte专项失败源于测试跳过开场后仍保留对话框，输入保护拦截了资料台按钮；在任何保存失败注入前即可复现。测试准备现通过正式对话控制器关闭开场并等待界面释放，再建立地牢场景。首次研读／停止与两类奖励保存失败后的重试均点击真实按钮，原完整回退及只领取一次的断言保留；没有修改游戏存档事务或弹窗输入保护。

本次两套专项与稀有资料室回归通过。浏览器隔离试玩已核对[领取前](../../../reference/recipe-study-point-v1/potential-before.png)和[领取后](../../../reference/recipe-study-point-v1/potential-claimed.png)，真实按钮显示1500潜能并在完成后变为不可用的“已领取”。[潜能奖励试玩](http://127.0.0.1:8044/tools/street-thug-boss-room-generation.html?no_reload&seed=study-room-v1-61&floor=1&area=%E8%B5%84%E6%96%99%E5%AE%A4&studyReward=potential)只在独立内存场景将当前范围设为已掌握，不读取或写入玩家存档。

回归：`tools/dungeon/test.mjs`、`tools/dungeon/test-generation.mjs`、`tools/test-dungeon-poi-layout.mjs`、`tools/test-dungeon-grid-scene-art.mjs`、`tools/test-manufacturing-unlocks.mjs`。检查以隔离内存和测试存储运行，不触碰玩家存档。渲染回归核对正式绘制分支、两态路径、0.12等比显示、固定朝向与共用阴影；本轮没有重新生成或编辑PNG。

## 可配置研究配方

下表由当前正本导出，修改配方目录后需重建知识目录并同步这份清单。

| 名称 | 配方ID |
|---|---|
| 基础路亚竿 | manufacturing.fishing_rod_lure_basic |
| 基础渔轮 | manufacturing.fishing_reel_basic |
| 尼龙主线·粗 | manufacturing.fishing_line_main_nylon_thick |
| 碳线子线 | manufacturing.fishing_leader_carbon |
| 编织主线 | manufacturing.fishing_line_braid_fixed |
| 金属前导线 | manufacturing.fishing_leader_lure_wire |
| 较大吃铅浮漂 | manufacturing.fishing_float_large |
| 固定铅坠·两克 | manufacturing.fishing_sinker_fixed_2g |
| 固定铅坠·三克 | manufacturing.fishing_sinker_fixed_3g |
| 中号单钩 | manufacturing.fishing_hook_single_medium |
| 浮水雷蛙 | manufacturing.fishing_lure_frog |
| 修理锤 | manufacturing.tool_repair_hammer |
| 维修钳 | manufacturing.tool_repair_pliers |
| 磨刀石 | manufacturing.tool_repair_whetstone |
| 帆布工具卷 | manufacturing.tool_repair_roll |
| 火石 | manufacturing.supply_flint_fire |
| 水桶 | manufacturing.tool_bucket_water_empty |
| 铁皮水壶 | manufacturing.tool_flask_iron_water |
| 青竹水壶 | manufacturing.tool_flask_bamboo_water |
| 竹蒸笼 | manufacturing.tool_steamer_bamboo_cooking |
| 铸铁炒锅 | manufacturing.tool_wok_iron_cooking |
| 深炸铁锅 | manufacturing.tool_fryer_pot_iron_cooking |
| 腌缸（玻璃罐） | manufacturing.tool_pickling_jar_cooking |
| 陶发酵坛 | manufacturing.tool_fermentation_jar_cooking |
| 带网汤锅 | manufacturing.tool_strainer_pot_pharmacy |
| 蒸馏器 | manufacturing.tool_distiller_pharmacy |
| 分层过滤片 | manufacturing.tool_layer_filter_sheet_pharmacy |
| 长柄药瓶 | manufacturing.tool_long_handle_flask_pharmacy |
| 钢盆 | manufacturing.tool_steel_basin_pharmacy |
| 压蒜器 | manufacturing.tool_garlic_press_pharmacy |
| 卷药器 | manufacturing.tool_roller_pharmacy |
| 注射器 | manufacturing.tool_syringe_pharmacy |
| 输液器 | manufacturing.tool_iv_set_pharmacy |
| 黄绵土客土 | manufacturing.soil_amend_yellow_cotton |
| 褐土客土 | manufacturing.soil_amend_cinnamon |
| 紫色土客土 | manufacturing.soil_amend_purple |
| 红壤客土 | manufacturing.soil_amend_red |
| 高山草甸土客土 | manufacturing.soil_amend_alpine_meadow |
| 水稻土客土 | manufacturing.soil_amend_paddy |
| 典型黑土客土 | manufacturing.soil_amend_black |
| 套索 | existing_hunting.consumable_hunting_snare |
