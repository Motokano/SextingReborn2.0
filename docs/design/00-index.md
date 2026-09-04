# 设计文档总览与模块索引

本文档为《潮碧物语》设计的总览；详细内容见各模块文件及 capitalism 目录。

> **索引维护说明（2026-09 清理后重建）**：模块表按文件性质分区（设计正本 / 实现口径与约定 / 执行清单与归档）。编号缺口（12/15/23-compost-ui/24-temp/27-audit/33）为**已归档或改名**文件，一览见 §二·C；`44-meal-balance-attribute-exp` 已改号 **48**。清理决策记录见 [design-cleanup-manifest.md](../../docs/design-cleanup-manifest.md)。

---

## 一、设计哲学摘要

- **世界观**：末世崩坏，冷兵器与武术主导；主角穿越后从零求生、寻回归途。
- **0 教学、0 引导**：规则仅通过行为与结果体现。
- **认知论（知道的就是知道的）**：未通过世界内途径得知的事物不出现在 UI/面板；**知道本身是奖励**，可错过的信息是特性（重玩价值），但每个关键信息至少保留一条世界内可达的线索链。
- **成长基调**：极为缓慢且痛苦（有意为之）——稀缺、不确定（概率结算、永不 100%）、归零风险；**该基调不视为缺陷**（01 / 05 / 24）。
- **痛苦与回报成对（对冲原则）**：路径越苦，峰值必须越高（临时质变、排他永久收益、仪式感）。
- **高风险、高惩罚**：完整死亡惩罚自始适用；**战斗非强制**（所有战斗可绕）；**无必备物品**（生产/料理/药品为可选增强）。

---

## 二、文档分区表

### A. 设计正本（规则 / 数值 / 世界设定，按编号）

| 模块 | 文件 | 内容摘要 |
|------|------|----------|
| 总览索引 | [00-index.md](00-index.md) | 本文件：设计哲学摘要、分区模块表、贸易子模块表 |
| 设计哲学 | [01-philosophy.md](01-philosophy.md) | 世界观、0 教学、认知论、成长基调、对冲原则、高惩罚、非强制战斗、无必备物品 |
| 区域结构 | [02-regions.md](02-regions.md) | 基地 / 野外 / 城镇 / 地牢；HUD/交互/NPC 摆放口径（引用 16） |
| 死亡与投保 | [03-death-and-insurance.md](03-death-and-insurance.md) | 死亡惩罚（战斗技能扣 10% 当前等级）、复活损毁恢复（部位上限 50%）、投保、代码、使用与共享规则 |
| 实战经验 | [04-combat-exp.md](04-combat-exp.md) | 经验上限、伤害加成 |
| 角色基础属性 | [05-character-attributes.md](05-character-attributes.md) | 五项属性、衍生、筋骨/柔韧/呼吸/身手/专注、物品栏、负重、减伤链（激活防具盾口径，见 37） |
| 生存属性 | [06-survival.md](06-survival.md) | 饱食、饮水、体力、精力、心情、定力、性能力、性别、营养、体温、底气与行气 |
| 战斗核心 | [07-combat-core.md](07-combat-core.md) | 回合刻、方向与范围、呼吸条（气力）与底气、出力、速度与先手/连击 |
| 命中招架与伤害 | [08-hit-parry-damage.md](08-hit-parry-damage.md) | 命中率、招架、卸力、减伤链（激活盾层 → 柔韧 → 微调，见 37） |
| 身体部位与状态 | [09-body-parts.md](09-body-parts.md) | 七部位、损毁模型（满值即失能；旧"骨折/自恢复"条目标已废）、手术 |
| 敌人设计 | [10-enemies.md](10-enemies.md) | 敌人与主角差异、配置、掉落池（默认可击杀，D17）；接线状态见文末「实现记录」 |
| 技能系统 | [11-skills.md](11-skills.md) | 生存/生活/战斗/特殊、熟练度（每肢固定槽 1 出招，无招式循环）、战斗技能规则；后遗症装配见 34 |
| 玩家间交易 | [13-p2p-trading.md](13-p2p-trading.md) | 交易码、接头暗号、兑换与时效 |
| NPC 与任务模板 | [16-npc-and-quest-template.md](16-npc-and-quest-template.md) | NPC 行为模板、触发条目模板、任务模板、林书瑶首例与 2 条触发条目 |
| Buff / Debuff 系统 | [18-buff-system.md](18-buff-system.md) | 通用触发、分层消耗、命中/效果条件、调试开关 |
| 动作系统 | [19-action-system.md](19-action-system.md) | 条件解锁的特殊指令、菜单执行、Tick、限次耗尽隐藏、与 hubs 呼吸法/步法对齐 |
| 地图视野 UI | [20-map-vision-ui.md](20-map-vision-ui.md) | 昼夜/距离分层/朝向倍率/格级遮挡与身后三邻格（纯显示层） |
| 沤肥桶 / 肥料站 | [23-fertilizer-bin-station.md](23-fertilizer-bin-station.md) | 沤肥批次、C/N 填料（数值口径）、放气窗互动、失败 buff、客土；肥料效果实装口径见 §23.7 banner |
| 属性经验成长 | [24-attribute-experience.md](24-attribute-experience.md) | 进食入池/睡眠概率结算（永不 100%、单次 +1）、阶梯（attribute_level 基准）、终局料理 +1 先天例外 |
| 身高与 BMI（首版） | [25-height-bmi.md](25-height-bmi.md) | 身高字段、创建时 BMI=22 反算体重、WHO 分段、bmi_tier_changed 事件、NPC BMI 条件与旧档兼容 |
| 物品数值区间随机 | [26-item-numeric-rolls-resolved-rolls.md](26-item-numeric-rolls-resolved-rolls.md) | `numeric_rolls` 模板区间、`resolved_rolls` 实例抽样、先 roll 再估值（无品质乘算）、堆叠与货币约定 |
| 物品模板字段分层盘点 | [27-item-template-fields-inventory.md](27-item-template-fields-inventory.md) | `items.json` / `equipment.json` / 实例分层、顶层键快照、`getItemTemplate` 合并口径；快照说明见文件头 |
| 农业种植与灌溉系统 | [28-agriculture-irrigation.md](28-agriculture-irrigation.md) | 11×11 农业地图、水池/水渠/供水、作物受水、建造物、轮作/土壤；本体已定案，公式以 `js/agriculture-map.js` 为单一真相源 |
| 藏身处账号仓库 | [29-hideout-warehouse.md](29-hideout-warehouse.md) | `hideout_warehouse` 存档、100→700 格、NPC 入口、堆叠/实例、腐败与冷藏、远驿、升级（12 付费 QoL + 4 扩仓） |
| 剧情大纲（遮天 / Blackout） | [30-story-outline-blackout.md](30-story-outline-blackout.md) | 世界观、七阀（孤儿等）、硅叶、林书瑶、主角、终局「遮天」；定稿状态，开放项见看板 k181 |
| 畜牧系统（草案） | [31-livestock-husbandry.md](31-livestock-husbandry.md) | 十字机械牧场、四区域旋转（上右下左）、动物个体/体重/饥饿、生态变量、产出/屠宰/繁殖、Perk 遗传、死因（饿死/病死）、17 模块（含需电规则，见 §11.2/32） |
| 畜牧可扩展性架构（实现约定） | [32-livestock-architecture.md](32-livestock-architecture.md) | 数据驱动三表（物种/模块/Perk）、动物实例模型、生态变量接口、effect_type + handler、modifier key 目录 |
| 肌肉系统（取代原经脉穴位） | [34-muscle-system-rework.md](34-muscle-system-rework.md) | 穴位→肌肉（22 肌群 × 478）；后遗症→大型被动（肌群槽装配，首批已落地）；招式三维分工；阶段四待做 |
| UI 自由窗口系统 | [36-ui-windows.md](36-ui-windows.md) | 仿 RO 浮动窗口：拖拽/缩放/显隐/锁定/重置、设备级持久化、认知门控合并、8 层 UI 演出 API |
| 模块化躯干防具与新底气护体 | [37-equipment-modular-armor.md](37-equipment-modular-armor.md) | 躯干防具模块化（底材 + 6 板位模块 + 激活制）；激活盾层减伤链；头部 3 槽常驻 + 眩晕累积；数值待定见看板 k154 |
| 装备数据契约（模块化 schema） | [38-equipment-data-contract.md](38-equipment-data-contract.md) | 模块表/防具模板/实例格式、槽点命名空间、effect_type 目录（单向伤害转换方向）、校验规则 |
| 手套与出招装备改造体系 | [39-glove-and-outfitting.md](39-glove-and-outfitting.md) | 手套=徒手武器（形态系数）、鞋六类（踹/扫/踏 + 步法）、左右分装取低、改造件/通货做装骨架 |
| 战斗场景与可互动元素 | [40-combat-scene.md](40-combat-scene.md) | 可互动元素（一次性动作范式）+ 酒瓶实例（眩晕灌入累积系统）；场地伤害/掩体预留 |
| 地牢材料分配 | [42-dungeon-material-allocation.md](42-dungeon-material-allocation.md) | 地表+七座主题地牢材料池、15 道终局菜稀料覆盖、电池/电箱（非采集）；实现记录见文末 §八 |
| 食物消化 | [43-food-digestion.md](43-food-digestion.md) | 餐位档、消化曲线（35 个 buff_food_*）、营养均衡（k79）、饮水即时、接线口径 |
| 地牢敌人完成度梯度 | [44-dungeon-enemy-gradient.md](44-dungeon-enemy-gradient.md) | 16 层 × 4 档敌人完成度框架（对齐 42）：成长标尺/威胁画像/经验阶梯/情报与六劫挂钩 |
| 电池经济数值骨架 | [45-battery-economy.md](45-battery-economy.md) | 电力锚线、电池容量档位、16 层掉落曲线、牧场需电模块耗电、起步储能；电箱 k91 暂缓 |
| 饭盒系统 | [46-lunchbox-design.md](46-lunchbox-design.md) | 打包一餐、容量升级线、批量（46 裁定：同款刷新时长不叠层）、腐败/保鲜 |
| 制药系统 | [47-pharmacy-system.md](47-pharmacy-system.md) | 制程、途径剂型、成瘾度、使用语义、知识获取；数值占位 ❓ 待调定；现状盘点见 §1（2026-09） |
| 用餐与进食经验 | [48-meal-balance-attribute-exp.md](48-meal-balance-attribute-exp.md) | 原 44-meal-balance-attribute-exp（改号）；营养均衡→进食经验倍率（k79 实装口径） |
| 终局料理生产线 | [life-cooking-final-goals.md](life-cooking-final-goals.md) | Raw→Intermediate→Final 终局料理底稿；关联 21/43/48 |

### B. 实现口径、约定与规范

| 模块 | 文件 | 内容摘要 |
|------|------|----------|
| 实现约定 | [14-implementation.md](14-implementation.md) | 技术栈、配置表、存档结构、字段口径、三类型伤害结算顺序等静态约定（实现状态追踪已迁 implementation-progress/.cursor） |
| 启动加载与解耦 | [17-loading-and-decoupling.md](17-loading-and-decoupling.md) | 启动加载与模块解耦约定 |
| 烹饪系统（实现收口） | [21-cooking-system-benchmarks.md](21-cooking-system-benchmarks.md) | 烹饪当前实现口径：单次制作、统一配方路由优先、旧表兜底、图鉴双写兼容（下篇调研/定案已归档） |
| 统一配方系统 | [22-recipe-system-unified.md](22-recipe-system-unified.md) | 配方主表/工艺表/interface、schema 校验、route 优先级、兼容期双写约定 |
| 代码文案规范 | [35-code-i18n-guideline.md](35-code-i18n-guideline.md) | 工具边界（防 mojibake）、key 命名规则、i18n 抽离流程、分批计划（进度快照见文件内标注） |
| 品质移除（决策与迁移记录） | [41-quality-removal.md](41-quality-removal.md) | 六档品质删除后的生效替代规则（稀有度=item_id、估值=base_value）；迁移执行记录已压缩 |

### C. 执行清单与归档

| 项 | 文件 | 说明 |
|------|------|------|
| 生存 Buff 回归清单 | [survival-buff-regression-checklist.md](survival-buff-regression-checklist.md) | 原 24-temperature-buff-implementation-checklist（去编号改名）；06/18 附属验收清单，勾选状态以当前代码为准 |
| 实现进度快照 | [implementation-progress.md](../implementation-progress.md) | 相对本索引的代码落地进度与下一步建议（非设计正本；2026-03 快照，需按需刷新） |
| 归档（`_archive/`） | [_archive/README.md](_archive/README.md) | 归档索引；含 12（经脉，被 34 取代）、33（呼吸条迁移，已完成）、15（todo，开放项转看板 k142/144/146/148）、23-compost-ui-mapping（UI 映射，已落地）、27-item-field-rules-audit-last-run（审计日志）、21-cooking-benchmarks-history（21 下篇） |
| Agent prompt / 清单（已迁 `docs/agents/`） | [../agents/README 索引占位](../agents/README.md) | agriculture-a6-checklist、agriculture-port、hideout-warehouse-port/ui、livestock-ui、wild-gathering 规则副本（若 README 未建，见各文件头） |

---

## 三、贸易与旅行商人（capitalism 子模块）

GAME_DESIGN 中「贸易与旅行商人」不单独成章，以 capitalism 目录下文件为准：

| 序号 | 文件 | 内容 |
|------|------|------|
| 12.1 | [capitalism/basic.md](../../capitalism/basic.md) | 交易场景分级（Market/Shop/Exchange/Travel）、交易上下文、会话与周期限额、资金池与商誉、商品与价格、货币与钱庄、旅行商人循环与风险、代理跑商、以物易物与价值计算、五档感受词、货币文案 |
| 12.2 | [capitalism/trader_template.md](../../capitalism/trader_template.md) | 商人 NPC 配置模板（称呼、类型、态度、库存与资金池、接受货币、隐性属性） |
| 12.3 | [capitalism/trade_ui_data_structures.md](../../capitalism/trade_ui_data_structures.md) | 交易界面最小字段（物品/商人结构、会话状态、价值计算接口、结算落地、地区-货物池与库存模板） |
| 12.4 | [capitalism/trade_ui_layout.md](../../capitalism/trade_ui_layout.md) | 交易弹窗布局、双列表、步进与给/要、感受行与成交 |
| 12.5 | [capitalism/items_template_and_style.md](../../capitalism/items_template_and_style.md) | 物品表模板与写作风格（A 类材料、鉴定前/后说明、货币类、base_value、钱庄兑换） |
| 12.6 | [capitalism/trading_tables.md](../../capitalism/trading_tables.md) | 地图表/scene_type、trading_scene_rules、merchant_scene_allowed、item_trade_limits、通胀与 actual_price |

---

## 四、实现模块清单（按实现顺序简表）

1. **基础框架与配置**：技术栈、`/data/` JSON、全局常数表、存档骨架 → 14
2. **角色与属性**：角色创建、属性重算、衍生属性、物品栏 → 05、14
3. **生存与底气**：Tick、饱食/饮水/体力/精力、心情/定力/营养/体温、底气与行气 → 06
4. **战斗核心**：回合刻、呼吸条（气力）/底气与出力、速度与先手/连击 → 07、05、06
5. **命中、招架与伤害**：命中率、招架、减伤链 → 08、05、06、37
6. **身体部位与敌人**：七部位、损毁与手术；敌人配置与掉落 → 09、10
7. **技能系统**：四类技能、熟练度、战斗技能规则与示例 → 11
8. **死亡与投保** → 03
9. **贸易与旅行商人**：capitalism 全块 → 12.1～12.6
10. **玩家间交易与存档** → 13、14
11. **区域与地牢**：基地/野外/城镇/地牢 → 02

---

*设计文档与实现模块总览（含 capitalism 并入；2026-09 清理后重建）。*
