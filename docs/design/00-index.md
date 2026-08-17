# 设计文档总览与模块索引

本文档为《潮碧物语》设计的总览；详细内容见各模块文件及 capitalism 目录。

---

## 一、设计哲学摘要

- **世界观**：末世崩坏，冷兵器与武术主导；主角穿越后从零求生、寻回归途。
- **0 教学、0 引导**：规则仅通过行为与结果体现。
- **高风险、高惩罚**：完整死亡惩罚自始适用。
- **战斗非强制**：所有战斗可绕；地牢目标为生存并撤离。
- **无必备物品**：生产/料理/药品等均为可选增强。

---

## 二、主设计文档模块表

| 模块 | 文件 | 内容摘要 |
|------|------|----------|
| 总览索引 | [00-index.md](00-index.md) | 本文件：设计哲学摘要、模块表、贸易子模块表 |
| 设计哲学 | [01-philosophy.md](01-philosophy.md) | 世界观、0 教学、高惩罚、非强制战斗、无必备物品 |
| 区域结构 | [02-regions.md](02-regions.md) | 基地 / 野外 / 城镇 / 地牢 |
| 死亡与投保 | [03-death-and-insurance.md](03-death-and-insurance.md) | 死亡惩罚、投保、代码、使用与共享规则 |
| 实战经验 | [04-combat-exp.md](04-combat-exp.md) | 经验上限、伤害加成 |
| 角色基础属性 | [05-character-attributes.md](05-character-attributes.md) | 五项属性、衍生、筋骨/柔韧/呼吸/身手/专注、物品栏、负重 |
| 生存属性 | [06-survival.md](06-survival.md) | 饱食、饮水、体力、精力、心情、定力、性能力、性别、营养、体温、底气与行气 |
| 战斗核心 | [07-combat-core.md](07-combat-core.md) | 回合刻、方向与范围、气力与底气、出力、速度与先手/连击 |
| 命中招架与伤害 | [08-hit-parry-damage.md](08-hit-parry-damage.md) | 命中率、招架、卸力、减伤链 |
| 身体部位与状态 | [09-body-parts.md](09-body-parts.md) | 七部位、效果、损毁、手术 |
| 敌人设计 | [10-enemies.md](10-enemies.md) | 敌人与主角差异、配置、掉落池 |
| 技能系统 | [11-skills.md](11-skills.md) | 生存/生活/战斗/特殊、熟练度、战斗技能通用规则与示例 |
| 体温 Buff 实施清单 | [24-temperature-buff-implementation-checklist.md](24-temperature-buff-implementation-checklist.md) | 体温重构部署清单：区域温度/四季、极寒极热 Buff、耐候阈值与升级接线、验收用例 |
| 身高与 BMI（首版） | [25-height-bmi.md](25-height-bmi.md) | 身高字段、创建时 BMI=22 反算体重、WHO 分段、bmi_tier_changed 事件、NPC BMI 条件与旧档兼容 |
| 物品数值区间随机 | [26-item-numeric-rolls-resolved-rolls.md](26-item-numeric-rolls-resolved-rolls.md) | `numeric_rolls` 模板区间、`resolved_rolls` 实例抽样、校验分层、先 roll 再品质、堆叠与货币约定（冻结规格） |
| 物品模板字段分层盘点 | [27-item-template-fields-inventory.md](27-item-template-fields-inventory.md) | `items.json` / `equipment.json` / 实例分层、顶层键快照、`getItemTemplate` 合并口径；`npm run audit:item-keys` 复扫 |
| 农业种植与灌溉系统 | [28-agriculture-irrigation.md](28-agriculture-irrigation.md) | 固定农业互动点、**11×11** 农业地图（§1、§16）、水池/水渠、主干与支流识别、供水分配、作物受水来源；本体接入见 §16 |
| 藏身处账号仓库 | [29-hideout-warehouse.md](29-hideout-warehouse.md) | `hideout_warehouse` 存档、100→700 格、NPC 入口、堆叠/实例、腐败与冷藏、远驿、升级与 `warehouse-upgrades.json` |
| 仓库 UI 外部设计 Prompt | [hideout-warehouse-ui-agent-prompt.md](hideout-warehouse-ui-agent-prompt.md) | 给无仓库访问权的前端 Agent：战斗技能/背包主题对齐、布局与交付物 |
| 账号仓库移植 · 分 Agent Prompt | [hideout-warehouse-port-agent-prompts.md](hideout-warehouse-port-agent-prompts.md) | W0～W9 执行顺序、全局约束、各 agent 可复制 Prompt、文件归属 |
| 烹饪系统（实现收口） | [21-cooking-system-benchmarks.md](21-cooking-system-benchmarks.md) | 烹饪当前实现口径：单次制作、统一配方路由优先、旧表兜底、图鉴双写兼容 |
| 统一配方系统（实现口径） | [22-recipe-system-unified.md](22-recipe-system-unified.md) | 配方主表/工艺表/interface、schema 校验、route 优先级、兼容期双写约定 |
| Buff / Debuff 系统 | [18-buff-system.md](18-buff-system.md) | 通用触发、分层消耗、命中/效果条件、调试开关 |
| 动作系统 | [19-action-system.md](19-action-system.md) | 条件解锁的特殊指令、菜单执行、Tick、可选限次耗尽隐藏、与 hubs 呼吸法/步法对齐 |
| NPC 与任务模板 | [16-npc-and-quest-template.md](16-npc-and-quest-template.md) | NPC 行为模板、触发条目模板、任务模板、林书瑶首例与 2 条触发条目 |
| 贸易与旅行商人 | 见下「贸易子模块表」 | 并入 capitalism 多文件 |
| 玩家间交易 | [13-p2p-trading.md](13-p2p-trading.md) | 交易码、接头暗号、兑换与时效 |
| 实现约定 | [14-implementation.md](14-implementation.md) | 技术栈、配置表、存档、字段中英对照 |
| 地图视野 UI | [20-map-vision-ui.md](20-map-vision-ui.md) | 昼夜/距离分层/朝向倍率/格级遮挡与身后三邻格（仅显示） |
| 剧情大纲（遮天 / Blackout） | [30-story-outline-blackout.md](30-story-outline-blackout.md) | 世界观、七阀、硅叶、林书瑶、主角、终局「遮天」（英 Blackout）及尾声；HTML 见 `tools/story-outline-zhetian.html` |
| 畜牧系统（草案） | [31-livestock-husbandry.md](31-livestock-husbandry.md) | 十字机械牧场、四区域顺时针旋转、动物个体/体重/饥饿、草高/板结/污染/疾病与血量、产出/屠宰/繁殖、Perk 遗传、畜牧技能、饲料料肉比、19 模块两层分工 |
| 后续可补充 | [15-todo.md](15-todo.md) | 敌人 AI、异常状态、技能形态等 |
| 实现进度快照 | [implementation-progress.md](../implementation-progress.md) | 相对本索引的代码落地进度与下一步建议（非设计正本） |

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
4. **战斗核心**：回合刻、气力/底气与出力、速度与先手/连击 → 07、05、06
5. **命中、招架与伤害**：命中率、招架、减伤链 → 08、05、06
6. **身体部位与敌人**：七部位、损毁与手术；敌人配置与掉落 → 09、10
7. **技能系统**：四类技能、熟练度、战斗技能规则与示例 → 11
8. **死亡与投保** → 03
9. **贸易与旅行商人**：capitalism 全块 → 12.1～12.6
10. **玩家间交易与存档** → 13、14
11. **区域与地牢**：基地/野外/城镇/地牢 → 02

---

*设计文档与实现模块总览（含 capitalism 并入）。*
