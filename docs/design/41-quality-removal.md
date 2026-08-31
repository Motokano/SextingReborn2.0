# 41 · 品质系统移除（迁移记录与替代规则）

> 决定（2026）：**全量移除**品质六档（`quality` / `quality_tier` / 品质色条）。唯一保留的数值随机是**装备 `numeric_rolls` / `resolved_rolls`**（数值区间浮动，与品质无关）。本文档记录迁移口径与各系统的替代方案。

## 一、新规则（一句话）

> **稀有度 = 物品身份（不同 `item_id`、不同掉落位置），不是同一件物品的档位。**

- 「地表橡木 / 地牢深层铁杉木」是两个 `item_id`；「粗糙橡木 / 传说橡木」这类概念**彻底消失**。
- 装备差异由**模板属性差异 + 词条 + `numeric_rolls`**承担。
- 物品估值：`base_value` **直接用**，不再乘品质系数。

## 二、各系统的替代方案

| 系统 | 旧：品质在干嘛 | 新：替代方案 |
|---|---|---|
| 采集 / 掉落 | 产出表行带 `quality_tier`，熟练度「品质上修」 | 产出表行 = `item_id` + `weight`；**熟练度提高稀有物品行的抽取权重**（`gathering_rare_weight_bonus`） |
| 生产 / 烹饪 | 成功率判定后「品质判定」，成品分六档 | **仅成功率判定**；成品效果由配方（菜）本身定义，无品质差异 |
| 进食属性经验（24） | 菜档基值 × 品质系数（0.8~2.2） | **一道菜一个固定经验值**，档位基值即最终值；精致程度由配方/档位体现（「会做佛跳墙」本身就是奖励） |
| 交易估值（26 / item-value） | `base_value × (1 + 0.1×档)` | `base_value` 直接取用，无乘算 |
| 装备 | `quality_tier` 实例字段 | `numeric_rolls` / `resolved_rolls`（**保留**）+ 词条 |
| UI | 品质色条（灰→红六档） | 移除；物品行不再带品质色条 |

## 三、数据迁移清单（已完成）

- `data/items.json`：移除全部 `quality` 字段（399 处）。
- `data/loot_tables.json`：移除 `quality_tier`，按 `item_id` 合并权重（`loot_bush` / `loot_grass`）。
- `data/gathering_point_instances.json`：移除 `quality_tier` / `quality_tier_max`，合并重复行；示例实例更名措辞。
- `data/equipment.json`：移除 `quality_tier`，更新文件头注释。
- `data/cooking-recipes.json`：移除 `base_output_quality_tier`。
- `data/recipes.json`：移除 24 处 `base_output_quality_tier`。
- `data/survival-config.json`：移除生产品质配置键（保留 `production_success_bonus_at_skill_1000`）。
- `data/ui_text_zhCN.json`：`gathering.msg.dropped/got` 去掉 `{quality}` 占位符；移除品质 tooltip 文案。

## 四、文档迁移清单（已完成）

`02` §2.1、`11` §8.2.1/8.2.2/8.2.2a、`14`、`21`、`24` §24.5a、`26`、`27`（两份字段清单）、`29`、`05`、`37`、`00-index`、`capitalism/items_template_and_style.md`、`wild-gathering-points-agent-rule.md`、仓库 UI prompt、畜牧 UI prompt、`implementation-progress.md`、`life-cooking-final-goals.md`。

## 五、工具 / 代码迁移（已完成）

- **工具**：`tools/build-items-json.mjs`、`tools/migrate-cooking-to-unified-recipes.mjs`、`tools/add-livestock-items.js`、`tools/test-hideout-warehouse.mjs` 与全部 HTML 编辑器（`gathering-point-editor` / `item-editor` / `recipe-editor` / `npc-editor` / `character-attributes-design-overview`）已移除品质列 / 字段。
- **运行时代码**：
  - `js/item-value.js`：有效基价 = `round(base_value)`，品质 API 保留为无害占位（`normalizeQualityTier→0`、`getQualityTierValueMultiplier→1`）。
  - `js/production-quality.js`：只判成功率（`base × (1 + skill/1000 × bonus)`），`output_quality_tier` 恒 0。
  - `js/gathering.js`：品质上修移除，改为**熟练度提高稀有物品行权重**（loot 行可选 `rare_weight`，权重 ×（1 + 熟练度% / 100 × rare_weight））。
  - `js/inventory-equipment.js` / `js/scene-app.js` / `js/scene-renderer.js` / `js/hideout-warehouse.js` / `js/agriculture-player-items.js` / `js/livestock-panel.js` / `js/npc-system.js`：移除实例 `quality_tier` 读写、堆叠/排序中的品质比较、tooltip 与快捷栏 key 中的品质字段；烹饪/制药改为仅成功率结算。
- **残留（无害）**：`js/production-quality.js` / `js/item-value.js` 保留兼容字段与占位 API（不参与数值）；旧存档中的 `quality_tier` 字段被 `copyItemInstance` 丢弃（不复制），读档不受影响。
