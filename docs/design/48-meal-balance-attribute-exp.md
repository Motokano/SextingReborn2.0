# 44 营养均衡第二轴 × 属性经验（k79）

> **状态**：已实装。数据：`data/buffs.json`、`data/survival-config.json`；代码：`js/survival.js`、`js/buff-system.js`、`js/scene-app.js`。
> **设计依据**：`43-food-digestion.md` §三（均衡第二轴）、§五（睡眠结算经验）；`24-attribute-experience.md` §24.5a（进食主通道数值）。

## 一、链条（与 43 §三 一致）

```
主食/荤/素 覆盖 → 均衡档（单一/搭配/均衡）→ 均衡 buff 持续补营养 → 营养值档位 → 属性经验倍率
```

- **档位定强度（饱食）**、**构成定均衡（经验）**——两轴正交（43 §三）。
- 经验与饱食**解耦**：每菜经验 = 档位基值 × 营养档位倍率，与 `satiety_total` 无关；苦力菜 ≈ 0 经验。

## 二、均衡判定（主食/荤/素 覆盖）

- 活性「消化中」buff（`food_digest` 标记）的 `judgment_tags.meal_composition` 被扫描；
- 仅计 `staple / meat / veg` 三类，`other`（饮、果、坚果、失败物）**不计入**；
- 覆盖类别数 → 档位：

| 覆盖类别数 | 档位 | 均衡 buff | 营养恢复/tick |
|---|---|---|---|
| 0~1 | 单一 single | 不挂 | 0 |
| ≥2 | 搭配 mixed | `buff_meal_balance_mixed` | +1 |
| ≥3 | 均衡 balanced | `buff_meal_balance_balanced` | +2 |

- 重复菜不重复计数（同菜不叠，天然去重）；`other` 再多吃也不提升档位——**想爬营养必须配齐主食+荤+素**。
- 配置键：`meal_balance_min_categories`（`mixed: 2`、`balanced: 3`）、`meal_balance_nutrition_per_tick`（`mixed: 1`、`balanced: 2`）。
- 运行：`survival.js` `syncMealBalanceBuff()` 在 `advanceTick` 起始重挂（`durationTicks 1`，与营养/疲劳段位 buff 同模式）；食用时 `getMealBalanceInfo()` 实时扫描（含刚吃下的那道）。

## 三、食物营养微量调（必要配套）

- **问题**：原 34 道菜消化 buff 的单道营养总量 100~290（如清汤鱼羹 200、清炖牛腩 245），营养值夹紧 100 → 人人贴顶极境 → 「均衡 → 营养值档位」整条链失效。
- **调整**：菜的营养改为**小量补充**（per-tick），均衡 buff 才是营养值主驱动：

| 档位 | 营养 per-tick | 单道总量（按档位时长） |
|---|---|---|
| 小食 snack | 0.05 ~ 0.15 | ≈2~4 |
| 家常 home | 0.20 ~ 0.35 | ≈9~15 |
| 精致 refined | 0.40 ~ 0.55 | ≈21~30 |
| 宴席 banquet | 0.60 ~ 0.80 | ≈40~56 |
| 盛宴 feast（预留） | ≈1.0 | ≈120~180 |
| 苦力菜 workhorse | 0 ~ 0.2 | ≈0~6 |

- 效果节奏：**均衡一餐**（荤+素+主食同时消化）≈ 菜营养 Σ1.0~1.5 + 均衡 +2 ≈ 3.2/tick → 十来个 tick 进充沛、半餐内进极境；**单一粗食**只有 ~0.1~0.3/tick，缓慢爬升或维持——"吃得配齐才养得好"。
- `addNutrition` 由 `Math.round` 改为保留 1 位小数（否则小数级营养被吞）；`getNutritionRangeByValue` 内部取整判定不受影响。

## 四、营养档位 → 属性经验倍率

- 食用时**快照当前营养档位**（`getNutritionTier()`）乘倍率：

| 档位 | 倍率 |
|---|---|
| 营养不良 malnutrition | ×0.5 |
| 正常 normal | ×1.0 |
| 充沛 abundant | ×1.5 |
| 极境 peak | ×2.0 |

- 配置键：`nutrition_tier_exp_mult`。
- 与 06 既有效果**正交叠加**：充沛 `×1.3` 潜能上限、极境 底气上限 `+15%` 照旧（06 §6.1.9），此处是新增的**经验结算倍率**（24 §24.5a D 对齐，档位命名统一为 06 口径）。

## 五、24 进食经验表对齐（餐位档）

- 每菜每维经验 = 档位基值 × 营养倍率（向下取整后 ≥1）；**一菜一个固定值**，无品质叠乘（41 已定）。
- 配置键：`meal_exp_by_tier`、`meal_exp_dims_by_tier`。

| 档位（24 旧 T 档） | 每维每餐经验 | 默认维度 |
|---|---|---|
| 小食 snack（T1 果腹） | 2 | 筋骨 |
| 家常 home（T2） | 6 | 筋骨 |
| 精致 refined（T3） | 20 | 筋骨+柔韧 |
| 宴席 banquet（T4 佳肴） | 65 | 筋骨+柔韧+呼吸 |
| 盛宴 feast（T5 珍馐） | 250 | 筋骨+柔韧+呼吸 |

- **苦力菜 ≈ 0 经验**：`workhorse: true` 的菜（粗面饼、压缩饼干）直接跳过发放——管生存不管成长（43 §三）。
- **单菜覆盖**：可选 `items.json` 字段 `attr_exp_grants: ["jingu", ...]` 覆盖档位默认维度（当前 34 道未配，走默认；逐菜风味分配留后续卡）。
- 日上限仍由胃硬约束（饱食上限 ≈3~5 餐/天，24 §24.5a A）。

## 六、接线

- **发放**：`scene-app.js` `grantFoodAttributeExp(itemId, tpl)`——食用成功（`edible_buff_id` 消化 buff 路径 或 运行时消化模板路径）后调用；`CharacterAttributes.grantAttributeExp` 入 24 经验池；食用消息追加反馈，如「使用了「清炖牛腩」。（筋骨+98 柔韧+98 呼吸+98）」。
- **结算**：睡眠照旧（`facility_bed` → `settleAttributeExpOnce`，24 §24.5a C 概率结算，永不 100%）——进食只入池、睡觉才升段，未动。
- **均衡扫描**：`buff-system.js` 新增 `getActiveFoodDigestCompositions()`；35 个食物 buff 的 `judgment_tags` 补 `meal_composition`；运行时消化模板同步带 `meal_composition/meal_tier`。

## 七、数值锚点（均可调）

| 量 | 值 |
|---|---|
| 均衡阈值 | 搭配 ≥2 类、均衡 ≥3 类（staple/meat/veg） |
| 均衡营养 | 搭配 +1/tick、均衡 +2/tick（消化期持续） |
| 菜营养（per-tick） | snack 0.05~0.15 / home 0.2~0.35 / refined 0.4~0.55 / banquet 0.6~0.8 / feast ~1.0 |
| 营养倍率 | 营养不良 ×0.5 / 正常 ×1 / 充沛 ×1.5 / 极境 ×2 |
| 每维经验 | snack 2 / home 6 / refined 20 / banquet 65 / feast 250 |
| 默认维度 | snack,home→[筋骨]；refined→[筋骨,柔韧]；banquet,feast→[筋骨,柔韧,呼吸] |
| 苦力菜 | 经验 ≈0（workhorse 跳过） |

## 八、后续 / 待定

- `attr_exp_grants` 逐菜风味分配（哪道菜养哪维）——可并入后续菜品细化卡。
- 饭盒（k75）实装后：一餐 = 盒内构成，均衡判定天然复用（盒 = 打包的活性消化集）。
- 盛宴档 15 道终局菜实装后补 exp/营养档位归属。
