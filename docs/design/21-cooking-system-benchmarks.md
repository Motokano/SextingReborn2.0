# 二十一、烹饪系统（实现收口）

> 本文档是烹饪系统的实现口径文档，只记录当前仓库已落地行为。  
> 对后续 Agent：如与历史讨论稿冲突，以本文件与 `js/scene-app.js`、`js/recipe-system.js`、`js/save-system.js` 为准。

---

## 21.1 当前范围

- 烹饪已接入统一配方路由（`RecipeSystem`），但仍保留旧烹饪配方表兜底。
- 当前制作是 **单次制作**（一次结算一次产物），**未实现批量制作**。
- 已实现主烹饪台与临时烹饪台两类站点；临时台到期可强制失败结算。

---

## 21.2 制作流程（已实现）

1. 选择工艺（`method_id`）。
2. 校验工艺是否在当前站点可用（含配件门禁）。
3. 投料并校验：材料存在、燃料/水值足够、体力足够、背包可接收产物。
4. 开始制作即扣除：
   - 全部投入材料；
   - 工艺成本（燃料、水、体力）；
   - 时间进入 `active_craft.remaining_ticks` 倒计时。
5. 每个 world tick 递减 `remaining_ticks`，归零时结算。
6. 结算优先走统一配方路由；若路由不可用或未命中，再走旧烹饪配方兜底。

补充：
- 制作中不可移动（通过 active craft 状态和 tick 驱动流程实现）。
- 无命中配方或制作失败时，发放失败产物（全局失败物或路由/配方失败产物）。
- 成功时才增加烹饪熟练度，并写入已知配方记录。

---

## 21.3 配方命中与结算口径

- 输入匹配：按 `item_id + count` 的 multiset 做“需求包含”匹配（允许超集投料）。
- 多配方命中：按 `match_weight` 加权随机选 1 条。
- 成功产物：`main_output`。
- 奖励产物：`bonus_outputs` 逐条独立概率判定，可同时命中多条。
- 失败产物优先级：
  - 统一路由：`recipe.failure_output > method.failure_output > 全局失败物`
  - 旧兜底：旧配方失败产物或全局失败物。

---

## 21.4 工艺与站点

- 工艺成本来自工艺表（燃料/水/ticks/体力），不是配方表。
- `requires_accessory_item_id` 控制工艺是否可用；未满足禁止开做且不扣资源。
- 临时烹饪台支持 `allowed_methods` 限制工艺集合。
- 临时台到期时：
  - 无进行中制作：直接移除；
  - 有进行中制作：强制失败结算后移除。

---

## 21.5 图鉴与存档兼容（双写）

已知烹饪配方在运行时和存档中执行兼容期双写：

- 旧字段：`known_cooking_recipe_ids`（运行时映射为 `known_cooking_recipes`）。
- 新字段：`known_recipe_ids_by_system.cooking`。

规则：

- 成功制作首次记录时，同时写旧字段与新字段。
- 读档时优先读取新字段；若新字段为空，回退旧字段。
- 存档归一化时，始终把两套字段同步为同一集合，避免分叉。

---

## 21.6 明确未实现项

- 批量制作（multi-craft / queue craft）未实现。
- 统一配方系统目前仅实装烹饪路由接线；其余 life 系仅占位数据与接口，尚无完整场景流程。
- 烹饪“自由标签锅”玩法未实现。

---

## 21.7 数据与代码锚点

- 配方主表：`data/recipes.json`
- 工艺表：`data/recipe-methods.json`
- life 技能接口：`data/life-skill-recipe-interfaces.json`
- 烹饪旧表（兜底）：`data/cooking-recipes.json`、`data/cooking-methods.json`
- 运行时路由：`js/recipe-system.js`
- schema 校验：`js/recipe-schema.js`
- 烹饪接线与结算：`js/scene-app.js`
- 存档双写与归一化：`js/save-system.js`

---

*版本：A8 文档收口版（按当前实现）。*
