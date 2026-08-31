# 物品模板数值范围随机（`numeric_rolls` / `resolved_rolls`）— 冻结规格（供实现）

> 本文档汇总策划与方案协商结论，供后续开发、`tools/item-editor.html`、`tools/build-items-json.mjs` 与运行时接入时对照。**实现前若变更口径，须同步修订本文档。**

---

## 1. 目标摘要

- 策划可为物品模板配置 **`numeric_rolls`**：对指定字段声明**数值区间**（策划直接指定 `min` / `max`，**不使用 `ratio` 相对模板倍率**）。
- 物品**生成新实例时一次性抽样**，结果写入实例 **`resolved_rolls`**（字段名 → 数值）。
- **禁止**在查询/UI/tick 中重复随机。
- **估值**：`base_value` 直接作为物品基线价值（品质乘算已随品质系统移除）；合成顺序见 §6。
- **旧存档**：实例无 `resolved_rolls` 时，业务读数回退模板字段（行为与「未启用浮动」一致）；**读档不自动补 roll**。

---

## 2. 非目标（首版）

- 不为每个浮动字段单独新增 CSV 列（如 `xxx_roll`）；统一使用结构化 **`numeric_rolls`**（如单列 JSON）。
- 不在本规格内定义完整交易 UI 实现；但估值调用须传实例并遵守 §6。

---

## 3. 模板：`numeric_rolls`

### 3.1 形状（逻辑）

- 对象为「字段名 → 抽样描述」，例如：

```json
{
  "base_value": { "min": 80, "max": 120, "distribution": "uniform", "integer": true },
  "weapon_attack_power": { "min": 18.5, "max": 21.0, "distribution": "uniform", "integer": false }
}
```

### 3.2 字段说明

| 键 | 含义 |
|----|------|
| `min` / `max` | **全闭区间** `[min, max]`，两端均包含。 |
| `distribution` | 首版建议仅 `uniform`；缺省可视为 `uniform`（实现须文档化）。未知取值策略见 §5。 |
| `integer` | `true`：结果为整数，§4.2；缺省或 `false`：**允许小数**。 |

### 3.3 黑名单（禁止作为 `numeric_rolls` 的键）

以下键**不得**出现在 `numeric_rolls` 中：

- `id`
- `sn`
- `placeholder_name`
- `fn_before`
- `fn`
- `category`
- `sub_category`

### 3.4 可浮动字段范围

- **除上述黑名单外，其余字段均可配置浮动**（不再单独维护数值白名单）。
- **策划自担平衡风险**（如 `weight_kg`、减伤、战斗字段等）。
- **货币**：不得配置浮动（数据或校验层强制：`numeric_rolls` 为空或校验拦截）；货币条目不参与数值随机。

---

## 4. 抽样规则

### 4.1 时机

- **仅**在「新实例创建」路径抽样一次；`copy`/`读档`/`展示` 不得抽样。

### 4.2 区间与整数

- 在 `[min, max]` 上按 `distribution` 抽样（首版均匀）。
- **`integer: true`**：结果为整数；**约定对抽样结果使用 `Math.floor`**。
  - **实现建议**：对整数需求优先采用 **`min`～`max` 闭区间上的离散均匀抽样**（整数个数 `max - min + 1`），避免「连续均匀 + floor」带来的边界分布偏斜；若采用连续均匀后再 `floor`，须在评审中接受分布形状并在注释中标明。
- **`integer` 未开启或为 false**：允许 **小数**。

### 4.3 `min === max`

- 视为合法：**常数**，抽样结果恒为 `min`（或等价整数）。

---

## 5. 校验与错误分层

### 5.1 硬错误（禁止保存 / 建议构建脚本同样拦截）

- `numeric_rolls` **JSON 无法解析**或顶层类型非法。
- **`numeric_rolls` 中出现黑名单键**。
- 其它结构性违规（由实现清单补充，如必填字段缺失若你们升格为硬错误）。

### 5.2 Warning + 整段跳过（策略 A）

- **单行**：若 `numeric_rolls` 结构合法且无黑名单，但存在**区间类非法**（例如 `min > max`、非数、`distribution` 不支持等），则对该物品：
  - **整条 `numeric_rolls` 视为无效**，**本物品不进行任何字段抽样**（等价于无浮动）；
  - 输出 **warning**（含行/id），便于策划修表。
- **不做**「仅跳过非法子键、其余键继续 roll」。

---

## 6. 实例：`resolved_rolls` 与估值合成顺序

### 6.1 存放

- 抽样结果写入实例 **`resolved_rolls`**：`{ "<field>": <number>, ... }`。
- 业务读数：**`resolved_rolls[field]` 优先**，缺失则 **回退模板 `tpl[field]`**。

### 6.2 `base_value` 与 `ItemValue`

- **先 roll**：`B = resolved_rolls.base_value ?? tpl.base_value`（`B` 可为小数）。
- **有效基价**：`effective = Math.round(B)`——**不再乘品质系数**（品质系统已移除）；最终标价取整策略以现有 `js/item-value.js` 为准。
- **其它字段**：默认仅使用 `resolved_rolls` 中的抽样值；如需对某字段做额外修正，须单列清单并改文档。

---

## 7. 堆叠与货币

- **默认**：所有物品**不可堆叠**。
- **例外**：**仅货币可堆叠**。
- **货币无浮动**：与 §3.4 一致。
- 若运行时仍存在通用堆叠代码路径：须保证与「仅货币可堆」数据约定一致，避免非货币误配 `stack_max`。

---

## 8. 编辑器与构建链（期望行为）

### 8.1 `tools/item-editor.html`

- 提供「选字段 + `min`/`max`/`integer`/`distribution`」的配置方式，避免手写易错 JSON（具体 UI 实现待定）。
- **黑名单 / 结构性违规** → **硬错误，禁止导出**。
- **区间类非法** → **warning**，该行按 §5.2 整段跳过 roll（导出是否允许：默认允许导出 CSV，但运行时该行不抽样；若 CI 要求零 warning，可加 strict 模式）。

### 8.2 `tools/build-items-json.mjs`

- 将 `numeric_rolls` 从 CSV 解析为 **对象**写入 `items.json`（须在 `handled` 中显式处理，避免扩展列变字符串）。
- 建议与编辑器同等的 **黑名单硬失败**；区间类可与编辑器一致 **warning + 该行无有效 roll**（或项目选择 `-strict` 失败）。

---

## 9. RNG 与测试

- 默认：`Math.random()`（或环境等价物）。
- 建议暴露 **可注入 RNG**（仅测试/调试），便于断言抽样与边界。

---

## 10. 展示层

- 浮动字段若在 tooltip / `item-info-modules` 中展示，须约定读 **`resolved_rolls`（实例）** 还是模板；**玩家可见数值应以实例为准**（若已生成实例）。

---

## 11. 相关代码索引（落地时核对）

| 区域 | 文件（示例） |
|------|----------------|
| 估值 | `js/item-value.js`、`js/inventory-equipment.js`（`getEffectiveBaseValue`） |
| 实例创建 / 复制 / 入包 | `js/inventory-equipment.js`（`putItemIntoDefaultContainer`、`copyItemInstance` 等） |
| 产出 | `js/gathering.js`、`js/scene-app.js`（烹饪/配方等）、`js/npc-system.js`（发奖） |
| 构建 | `tools/build-items-json.mjs` |
| 编辑 | `tools/item-editor.html` |

---

## 12. 修订记录

| 日期 | 说明 |
|------|------|
| （创建） | 初版：绝对区间、`resolved_rolls`、全闭区间、整数 `floor`、黑名单硬错误、区间非法 warning 整段跳过、先 roll 再估值（无品质乘算）、仅货币可堆且无浮动、除黑名单外皆可浮动、允许小数。 |
