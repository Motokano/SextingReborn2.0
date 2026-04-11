# 二十二、统一配方系统（实现口径）

> 本文档描述 `RecipeSystem` / `RecipeSchema` 的已实现行为，用于指导后续扩展（锻造、制药、纺织、制造、改造）。

---

## 22.1 当前实现状态

- 已实现统一数据结构：
  - `data/recipes.json`（`recipes` map）
  - `data/recipe-methods.json`（`methods` map）
  - `data/life-skill-recipe-interfaces.json`（`interfaces` map）
- 已实现运行时路由模块：`js/recipe-system.js`
- 已实现统一 schema 校验模块：`js/recipe-schema.js`
- 已在 `scene-app.loadConfig()` 接线：加载 -> 校验 -> 注入 `RecipeSystem`
- 当前实际制作流程只接入烹饪，其他 life 系为占位数据。

---

## 22.2 路由与优先级

统一字段解析优先级（已实现）：

- `recipe` 覆盖 > `method` 默认 > `interface` 默认

关键解析字段：

- `required_skill_id`
- `recipe_processor_id`
- `proficiency_usage_key`
- `base_success_rate`
- `failure_output`
- `allowed_station_tags`
- `requires_accessory_item_id`（可选，`null` 表示不要求配件；与烹饪技法表配件门禁同语义）

若 `recipe_processor_id` 最终无法解析，`craft` 返回错误，不会静默成功。

---

## 22.3 匹配与结算语义（路由层）

- `matchRecipes(ctx)` 需要：
  - `recipe_system`
  - `method_id`
  - `inputs[]`
- 匹配条件：
  - `recipe.enabled !== false`
  - `recipe.recipe_system` 与 `ctx.recipe_system` 一致
  - `recipe.method_id` 与 `ctx.method_id` 一致
  - `inputs` 覆盖配方需求（允许超集投料）
- 多命中按 `match_weight` 加权随机选 1 条。
- `craft(ctx)` 把已选配方与 route meta 交给 `processor` 执行。

说明：路由层不直接扣料/推进时间/加熟练度，这些由上层业务（当前是烹饪流程）负责。

---

## 22.4 Schema 校验行为

`validateRecipeTables()` 当前行为：

- 校验入口统一（运行时与编辑器复用同一模块）。
- 条目级失败：非法条目被剔除，合法条目继续保留。
- 支持错误与警告报告：
  - `errors[]`
  - `warnings[]`
- 错误结构包含：`entry_type`、`id`、`error_code`、`message`、`path`。
- 不会因首条错误短路整表，单条可累计多错误。

`unlock.type` 当前仅允许：

- `skill_level_min`
- `quest_flag`
- `npc_flag`

`quest_flag` / `npc_flag` 仅校验必填字段（`flag` / `npc_id`）；不在 schema 层对照任务或 NPC 权威表（无存在性 warning/error）。

---

## 22.5 生命周期约束（已实现）

- 首版是 **单次制作**。
- **批量制作未实现**：路由层与烹饪层都没有 batch 参数与批处理循环。
- 配方图鉴记录时机：当前烹饪实现为“成功结算后写入”。
- 熟练度计数时机：当前烹饪实现为“成功结算后增加”。

---

## 22.6 兼容期双写（烹饪）

统一配方图鉴结构已引入，但处于兼容期：

- 旧：`known_cooking_recipe_ids`
- 新：`known_recipe_ids_by_system.cooking`

存档行为（`SaveSystem`）：

- 读取优先新字段，缺失时回退旧字段。
- 保存前会归一化并双写回两套字段。

后续收口前，禁止删除任一字段读写链路。

---

## 22.7 扩展约定（按当前实现推导）

后续把其他 life 系接入统一配方时，应沿用：

- 单次制作流程（先不引入批量）。
- 同一套 schema 校验器与错误报告。
- 同一套 route 优先级（recipe > method > interface）。
- 与烹饪一致的“成功后记图鉴/熟练度”时机，除非设计文档明确例外。

