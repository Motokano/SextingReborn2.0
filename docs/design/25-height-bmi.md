# 25 身高（Height）与 BMI 设计（首版）

本文定义角色身高与 BMI 的首版口径。目标是：先建立稳定的数据与事件接口，并通过 BMI 分段 Buff 驱动数值效果；避免在多个子系统重复硬编码第二套 BMI 规则。

---

## 25.1 设计目标与边界

- 本期新增角色属性：`height_cm`（身高，厘米）。
- 身高本身不直接产生数值效果。
- BMI 由 `height_cm` 与 `weight_kg` 实时计算，不新增持久化 `bmi` 字段。
- BMI 的效果由 Buff 监听与条件系统消费。
- 常驻状态面板本期不强制展示身高/BMI；后续由设施入口展示。

---

## 25.2 身高字段定义

### 25.2.1 字段与单位

- 字段名：`height_cm`
- 单位：cm
- 精度：整数

### 25.2.2 取值范围

- 最小值：`140`
- 最大值：`210`
- 写入规则：任何来源写入都需 clamp 到 `[140,210]`，并取整。

### 25.2.3 生命周期

- 创建角色时由玩家输入 `height_cm`。
- 创建后固定不变（本期无成长、药剂、事件改身高逻辑）。

---

## 25.3 创建角色与初始体重

### 25.3.1 创建输入

- 角色创建流程新增身高输入项：`height_cm`（范围校验 `140~210`，整数）。

### 25.3.2 初始体重反算（固定口径）

- 创建角色初始体重采用目标 BMI=22 的反算：

\[
weight\_kg = 22 \times \left(\frac{height\_cm}{100}\right)^2
\]

- 初始 `weight_kg` 保留 1 位小数。
- 示例：`height_cm=178` 时，`weight_kg=69.7`。

---

## 25.4 BMI 计算口径

### 25.4.1 计算公式

\[
BMI = \frac{weight\_kg}{\left(\frac{height\_cm}{100}\right)^2}
\]

- BMI 为运行时派生值，不入库存档。
- 统一对外显示与事件 payload 使用 1 位小数。

### 25.4.2 分段标准（WHO）

- `underweight`：`BMI < 18.5`
- `normal`：`18.5 <= BMI < 25.0`
- `overweight`：`25.0 <= BMI < 30.0`
- `obese`：`BMI >= 30.0`

分段枚举固定使用英文值：

- `underweight`
- `normal`
- `overweight`
- `obese`

---

## 25.5 Buff 监听事件

### 25.5.1 事件名

- `event_kind = survival`
- `event_name = bmi_tier_changed`

### 25.5.2 触发时机

- 仅当 BMI 分段发生变化时触发。
- 不在每次 BMI 数值微变时触发。

### 25.5.3 tags

事件 `tags` 追加分段标签（四选一）：

- `bmi_underweight`
- `bmi_normal`
- `bmi_overweight`
- `bmi_obese`

### 25.5.4 payload 最小集

- `bmi`（1 位小数）
- `old_tier`
- `new_tier`

---

## 25.6 NPC 条件扩展

NPC 条件系统新增 BMI 判定（首版）：

- `bmiGte`（参数：`value`）
- `bmiLte`（参数：`value`）
- `bmiRange`（参数：`min`、`max`，含边界）

数据源统一使用运行时实时 BMI（由 `height_cm + weight_kg` 计算）。

---

## 25.7 存档兼容

- 新存档写入 `height_cm`。
- 旧存档若缺少 `height_cm`，读取时补默认值 `178`。
- 旧存档已有 `weight_kg` 时保持不变，不按 BMI=22 回填覆盖。
- BMI 依旧为派生值，不需要迁移字段。

---

## 25.8 UI 与设施边界（本期）

- 常驻状态栏不强制显示身高/BMI。
- 本期仅预留后续设施查询入口，不绑定具体设施实现。
- 后续若新增设施展示，读取口径必须复用本文件公式与分段，不得新建并行计算口径。

---

## 25.9 实现对齐清单（供实现阶段使用）

1. 生存状态新增 `height_cm`，并完成 clamp/整数化与旧档补值。
2. 角色创建流程新增身高输入校验。
3. 创建角色初始体重改为 BMI=22 反算（1 位小数）。
4. 增加 BMI 计算 helper（运行时派生）。
5. 增加 BMI 分段 helper（WHO）。
6. 在分段变化处发射 `survival:bmi_tier_changed`。
7. 在事件注册表登记 `bmi_tier_changed` 与 `bmi_*` tags。
8. NPC 条件扩展 `bmiGte/bmiLte/bmiRange`。

---

## 25.10 BMI 四段 Buff 作用定义（已定）

### 25.10.1 全局口径（强制）

- 五维百分比加成词条在**没有额外说明**时，统一按“先天值”为基底计算增量。
- 计算出的增量统一加到“后天值”层，不直接改先天值。
- 百分比增量结果统一向下取整（`floor`）。
- 本口径适用于本节全部 BMI 词条（含 `normal/overweight/obese` 的五维加成）。

### 25.10.2 分段效果表

#### `underweight`（偏瘦）

- 招式速度 `+5%`。
- 受到伤害 `+5%`。
- 受伤加成时序：进入伤害最终结算乘区（所有减伤完成后再 `×1.05`，最终再 `floor`）。

#### `normal`（正常）

- 后天五维加成（按先天为基底）：
  - `jingu +5%`
  - `flexibility +5%`
  - `breath +5%`
  - `dexterity +5%`
  - `focus +5%`
- 各项增量均向下取整后加到后天。

#### `overweight`（超重）

- 招式速度 `-5%`。
- 后天 `jingu +10%`（按先天 `jingu` 为基底，增量向下取整后加到后天）。

#### `obese`（肥胖）

- 招式速度 `-40%`。
- 后天 `jingu +20%`（按先天 `jingu` 为基底，增量向下取整后加到后天）。
- 后天 `flexibility +20%`（按先天 `flexibility` 为基底，增量向下取整后加到后天）。

### 25.10.3 互斥与覆盖

- BMI 分段 Buff 在同一时刻仅允许命中一个分段效果（`underweight/normal/overweight/obese` 互斥）。
- 分段切换后，旧分段效果必须移除，新分段效果生效；切换触发 `bmi_tier_changed` 事件。

---

*本文件为身高与 BMI 首版设计口径。后续若引入体型、装备尺寸、代谢或战斗联动，应在本文件新增章节并保持单一公式真相。*
