# 三十八、装备数据契约（模块化防具实现 schema）

> **状态**：数据契约 v0（实现地基）。字段名/结构以本文件为准，实现与未来扩展（37 §10）都以此为准绳。
> **前置**：机制正本 [37-equipment-modular-armor.md](37-equipment-modular-armor.md)。本文件只定义**数据结构**，规则解释见 37。

## 1. 槽点命名空间（槽点 = 模块可占用的最小位置）

| 命名空间 | 槽点 | 所属底材 | 规则 |
|----------|------|----------|------|
| `clothing.*` | `chest` / `abdomen` / `arm_l` / `arm_r` / `leg_l` / `leg_r` | 躯干防具（6 板位） | 减伤激活后生效；空板位有材料兜底 |
| `head.*` | `shell`（盔体）/ `liner`（内衬）/ `face`（护面） | 头部防具（3 槽） | 常驻生效；`face` 为万能功能槽（不提供被动减伤） |

- 槽点命名空间**开放**：未来新增强化槽（如 `clothing.extra1`、`head.face2`）直接扩展，占用/结算逻辑不变（37 §10.5）。
- 占用规则：**一个槽点同一时间至多被一个模块占用**；模块安装后占用其 `occupies` 声明的槽点集合（省略 = 默认占用被安装的那个槽点）。复合模块可一次占用多个槽点。**同一防具上同种模块的数量受 `max_per_armor` 限制**（可多槽位安装的模块不能全槽装满）。

## 2. 模块表 `data/modules.json`

```jsonc
{
  "_comment": "模块 = 独立物品，装在防具槽点上。字段：id/name/desc/install_slots(可安装槽点候选)/occupies(安装后实际占用，省略=默认被安装槽点)/max_per_armor(同防具数量上限，省略=不限)/weight_kg/activation_cost_pct(额外消耗%，可负)/effects(基础属性，声明式)/special(特殊模块)/segments(复合模块分部位段)/special_effect(特殊效果，全部激活才生效)/enchant_slot(附魔位数，当前 1)",

  "mod_kevlar_plate": {
    "id": "mod_kevlar_plate",
    "name": "凯夫拉片",
    "desc": "硅叶浸布硬片，主挡劈砍；可装于多个板位，但一件防具至多两片。",
    "install_slots": ["clothing.chest", "clothing.abdomen", "clothing.arm_l", "clothing.arm_r"],
    "max_per_armor": 2,
    "weight_kg": 0.8,
    "activation_cost_pct": 0.10,
    "effects": [
      { "effect_type": "armor_bonus", "effect_params": { "slash_pct": 0.12, "pierce_pct": 0.06, "blunt_pct": 0.04 } }
    ],
    "special": false,
    "enchant_slot": 1
  },

  "mod_soft_liner_arm": {
    "id": "mod_soft_liner_arm",
    "name": "皮内衬",
    "desc": "柔软缓冲，防震荡。",
    "install_slots": ["clothing.arm_l"],
    "weight_kg": 0.3,
    "activation_cost_pct": 0.08,
    "effects": [
      { "effect_type": "armor_bonus", "effect_params": { "blunt_pct": 0.10, "slash_pct": 0.04 } }
    ],
    "special": false,
    "enchant_slot": 1
  },

  "mod_hooded_coat": {
    "id": "mod_hooded_coat",
    "name": "兜帽大衣",
    "desc": "复合模块（套装件）：占胸腹板位 + 盔体槽。",
    "install_slots": ["clothing.chest"],
    "occupies": ["clothing.chest", "clothing.abdomen", "head.shell"],
    "weight_kg": 2.1,
    "activation_cost_pct": 0.25,
    "segments": {
      "head":     { "effects": [ { "effect_type": "armor_bonus", "effect_params": { "blunt_pct": 0.12 } } ] },
      "clothing": { "effects": [ { "effect_type": "armor_bonus", "effect_params": { "slash_pct": 0.15, "pierce_pct": 0.10 } } ] }
    },
    "special": true,
    "special_effect": { "effect_type": "damage_type_convert", "effect_params": { "from": "slash", "to": "pierce" } },
    "enchant_slot": 1
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` / `name` / `desc` | string | 标识 / 展示名 / 描述（三档展示可后续扩展） |
| `install_slots` | string[] | **可安装槽点**（候选列表，§1 命名空间）。单槽模块 = 1 个；可多槽位模块 = 多个候选；复合模块 = 主槽点（装到它触发跨槽占用） |
| `occupies` | string[] | **安装后实际占用**的槽点集合（可选）。省略 = 默认占用被安装的那个槽点；复合/特殊模块 = 固定多槽点集合 |
| `max_per_armor` | number | **同种模块在同一防具上的最大安装数**（可选）。省略 = 无限制；可多槽位模块用它防止"全槽装满同一种" |
| `weight_kg` | number | 模块重量（计入负重） |
| `activation_cost_pct` | number | 额外底气消耗%（**可负**=减耗模块），参与激活成本：`base_shield × (1 + Σ pct)` |
| `effects` | Effect[] | 模块基础属性（声明式效果，§5 effect_type 目录）。单槽点模块直接用本字段 |
| `segments` | object | **复合模块专用**：分部位数值段（`head` / `clothing` 各自 `effects`）。头部段常驻、躯干段激活制（37 §3.5） |
| `special` | boolean | 是否特殊模块（规则级效果） |
| `special_effect` | Effect | **特殊效果**：仅当全部处于激活时生效（跟随躯干激活）（37 §3.5） |
| `enchant_slot` | number | 附魔位数。当前统一 `1`（"1 条"是规则层约束，结构支持多来源词条，见 37 §10.4） |

## 3. 防具模板字段（`data/equipment.json` 更新）

底材在现有字段基础上新增：

```jsonc
{
  "eq_clothing_combat_suit": {
    "id": "eq_clothing_combat_suit",
    "equip_slot": "clothing",
    "material": "leather",                                   // 材料（§3.1 材料 → 兜底属性）
    "base_shield": 24,                                       // 基础盾量（激活成本与盾池）
    "module_slots": ["chest", "abdomen", "arm_l", "arm_r", "leg_l", "leg_r"],
    "pocket_slots": 3,
    "weight_kg": 1.2,
    "enchant_slots": 0                                        // 底材本身无词条槽（词条全来自模块）
  },
  "eq_head_leather_helm": {
    "id": "eq_head_leather_helm",
    "equip_slot": "head",
    "material": "leather",
    "module_slots": ["shell", "liner", "face"],
    "weight_kg": 0.4,
    "enchant_slots": 0
  }
}
```

**新增/变更字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `material` | string | 材料 id（映射到 §3.1 材料表；决定空板位兜底属性） |
| `base_shield` | number | 基础盾量：决定激活成本与盾池大小（头部防具无此字段/恒 0——头不接激活） |
| `module_slots` | string[] | 槽点列表（躯干 6 板位 / 头部 3 槽；可配置） |
| `enchant_slots` | number | 底材自身词条槽 = **0**（词条全部来自模块；旧字段保留为 0，防误用） |
| `damage_reduce_*_pct` | number | **废弃**（旧模型整件减伤字段不再作为底材防护来源） |

## 4. 实例格式（存档）

```jsonc
"equipment": {
  "clothing": {
    "item_id": "eq_clothing_combat_suit",
    "modules": {
      "chest":   { "item_id": "mod_kevlar_plate",    "enchant_id": "enc_defense_5" },
      "abdomen": null,
      "arm_l":   { "item_id": "mod_soft_liner_arm",  "enchant_id": null },
      "arm_r":   null,
      "leg_l":   null,
      "leg_r":   null
    }
  },
  "head": {
    "item_id": "eq_head_leather_helm",
    "modules": {
      "shell": { "item_id": "mod_helm_leather_shell", "enchant_id": null },
      "liner": { "item_id": "mod_helm_soft_liner",    "enchant_id": null },
      "face":  { "item_id": "mod_face_lamp",          "enchant_id": "enc_hit_2" }
    }
  }
}
```

**规则：**
- `modules` 键 = 该底材 `module_slots` 的槽点；**空槽一律 `null`**（对齐现有"空槽写 null"约定）。
- 模块实例 = `{ item_id, enchant_id }`；附魔（1 条，可空）**随模块走**（可拆卸可复用，附魔不丢）。
- **复合模块**挂在主底材（`clothing`）的 `modules` 里（占 `clothing.chest` 槽点），其 `occupies` 声明同时占据 `head.shell`；`head` 底材只作**在场前置**（穿戴），不重复存储（37 §8）。
- 每个槽点实例的 `item_id` 必须满足：该模块的 `occupies` 包含该槽点（或该槽点是其占用集合之一）。
- 存档兼容：旧档 `equipment.clothing.enchants` 废弃；加载时迁移为无模块的白板底材（材料兜底保留），模块化实例按新格式初始化。

## 5. effect_type 目录（声明式效果）

| effect_type | 用途 | effect_params | 适用 |
|-------------|------|---------------|------|
| `stat_bonus` | 后天属性加成 | `stat_id`(jingu/flexibility/breath/dexterity/focus)、`value` | 模块/词条 |
| `hit_bonus` | 命中率加成 | `hit_pct`（小数） | 模块/词条/护面功能 |
| `armor_bonus` | 三系减伤 | `slash_pct`/`pierce_pct`/`blunt_pct`（0~1） | 模块（基础属性/附魔） |
| `speed_bonus` | 战斗速度加成 | `speed_pct` | 模块/词条 |
| `skill_coef` | 技能系数修正 | `coef`（乘数） | 手套/鞋类模块 |
| `anti_stun` | 抗眩晕（**头部专属**） | `anti_stun_pct`（0~0.6） | 头部模块（37 §9.2） |
| `damage_type_convert` | 伤害类型转换（特殊/复合效果）；**任意顺向可跨级、严禁反向**（顺序 钝击→劈砍→戳刺，见 08）。只改伤害类型，形态/系数不变 | `from`/`to`（blunt/slash/pierce；顺向：钝→劈、劈→戳、钝→戳） | 特殊模块 `special_effect` |
| `form_convert` | 徒手形态转换（改造件）；**任意顺向可跨级、严禁反向**（顺序 拳→掌→戳，见 39）。改形态 → 连带换系数（`form_coefs`）与伤害类型（形态映射） | `from`/`to`（拳/掌/戳；顺向：拳→掌、掌→戳、拳→戳） | 改造件（出招装备） |
| `func_*` | 护面万能槽功能（任意方向） | 按模块设计 | 护面槽（37 §9.3） |

- **扩展约定**（37 §10.1）：新增效果 = 表内加一行 + 注册 handler；**禁止** `switch(effect_id)` 硬编码。
- `armor_bonus` 同槽点多来源（模块基础属性 + 附魔）按 37 §4.3 规则参与减伤/扣盾。

## 6. modifier key 目录（统一修正层，37 §10.2）

| key | 默认 | 含义 |
|-----|------|------|
| `damage_reduce_slash` / `pierce` / `blunt` | 加区 0 | 各类型减伤（模块/词条/材料兜底/未来系统叠加） |
| `base_shield` | 乘区 1 | 基础盾量（激活成本与盾池） |
| `activation_cost` | 乘区 1 | 激活成本修正（减耗模块/未来系统） |
| `anti_stun` | 加区 0 | 抗眩晕豁免% |
| `hit` | 加区 0 | 命中加成 |
| `speed` | 加区 0 | 速度加成 |
| `weight` | 加区 0 | 重量修正 |

- 所有参与结算的数值经 `getModifier(key)` 聚合（模块 / 材料 / 强化系统 / buff 统一叠加），来源带 `source` 标记（37 §10.3）。

## 7. 校验规则（实现时执行）

1. **槽点存在**：模块 `occupies` 引用的槽点必须存在于目标底材的 `module_slots`。
2. **占用冲突**：同一槽点至多一个模块；复合模块占用的槽点均不可再装其他模块。
3. **复合模块前置**：`occupies` 同时含 `head.*` 与 `clothing.*` 时，两个底材必须同时在场，否则不可安装/生效。
4. **附魔上限**：模块实例 `enchant_id` 数量 ≤ 模板 `enchant_slot`（当前 1）。
5. **抗眩晕专属**：`anti_stun` 仅允许出现在 `head.*` 槽点模块；其他槽位/模块/词条禁用。
6. **护面约束**：`face` 槽模块不提供 `armor_bonus`（被动减伤）；可用 `func_*` 或非减伤 effect_type。
7. **减伤上限**：头部防具总减伤 ≤ ~20%、抗眩晕豁免 ≤ 60%（37 §9.4 红线）。

## 8. 开放扩展（对齐 37 §10）

- 新槽位：扩展 §1 命名空间 + 底材 `module_slots` 配置。
- 新效果：§5 加行 + 注册 handler。
- 新修正：§6 加 key。
- 额外词条（未来强化系统）：实例 `enchant_id` 扩展为多来源集合（`[{enchant_id, source}]`），按 `source` 管理（37 §10.4）。
- 存档：实例预留 `extras`/`overrides` 开放容器 + 版本迁移钩子（37 §10.7）。
