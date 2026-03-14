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
| 战斗核心 | [07-combat-core.md](07-combat-core.md) | 回合刻、方向与范围、气劲、出力、速度与先手/连击 |
| 命中招架与伤害 | [08-hit-parry-damage.md](08-hit-parry-damage.md) | 命中率、招架、卸力、减伤链 |
| 身体部位与状态 | [09-body-parts.md](09-body-parts.md) | 七部位、效果、损毁、手术 |
| 敌人设计 | [10-enemies.md](10-enemies.md) | 敌人与主角差异、配置、掉落池 |
| 技能系统 | [11-skills.md](11-skills.md) | 生存/生活/战斗/特殊、熟练度、战斗技能通用规则与示例 |
| 贸易与旅行商人 | 见下「贸易子模块表」 | 并入 capitalism 多文件 |
| 玩家间交易 | [13-p2p-trading.md](13-p2p-trading.md) | 交易码、接头暗号、兑换与时效 |
| 实现约定 | [14-implementation.md](14-implementation.md) | 技术栈、配置表、存档、字段中英对照 |
| 后续可补充 | [15-todo.md](15-todo.md) | 敌人 AI、异常状态、技能形态等 |

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
4. **战斗核心**：回合刻、气劲与出力、速度与先手/连击 → 07、05
5. **命中、招架与伤害**：命中率、招架、减伤链 → 08、05、06
6. **身体部位与敌人**：七部位、损毁与手术；敌人配置与掉落 → 09、10
7. **技能系统**：四类技能、熟练度、战斗技能规则与示例 → 11
8. **死亡与投保** → 03
9. **贸易与旅行商人**：capitalism 全块 → 12.1～12.6
10. **玩家间交易与存档** → 13、14
11. **区域与地牢**：基地/野外/城镇/地牢 → 02

---

*设计文档与实现模块总览（含 capitalism 并入）。*
