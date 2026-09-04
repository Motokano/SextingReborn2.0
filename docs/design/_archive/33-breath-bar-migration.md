# 三十三、气力 → 呼吸条（breath_bar）代码迁移清单

> 设计正本：`07-combat-core.md`「气力值＝呼吸条」「核心条件不满足时的结算」；`11-skills.md` 8.3.3（`breath_bar` 结构、核心条件模式）。本文档只记录**从旧气力实现迁移到新模型的代码改动**，不重复设计论证。

**状态**：数据层已完成（见 §2）；**代码层已实施**（§3，2026 改动：survival / melee-resolve / hub-actions / scene-app / character-attributes 五文件 + survival-config），自检用例通过（§5）。遗留仅 `combat-hub-actions` 的 `restore_qi_li` 死代码与 `scene-app` 的 `qi_li_restored` 展示为**兼容保留**，不再被数据驱动命中。

---

## 1. 目标行为（迁移后应满足）

| # | 行为 | 依据 |
|---|------|------|
| B1 | 未挂载呼吸法 → `qi_li_max = 0`，无呼吸条，耗气力招式不可用 | `07`「存在前提」 |
| B2 | 挂载呼吸法 → `qi_li_max` 由 `breath_bar.max_base`（+`max_growth`，若有）给出 | `11` 8.3.3 |
| B3 | 呼吸条为**常驻资源**：装备呼吸法即存在，**进出战斗不重置**当前值（无满条、无清零）；**唯一重置点**是切换呼吸法（1 tick + 读取新呼吸法 `initial_state.qi_li`，基本呼吸法 0） | `07`「常驻资源」「切换」 |
| B4 | 呼吸条回气**每个 tick 收束判定**（战斗中一轮=一 tick，非战斗同样回气）：按 `breath_bar.regen` 回；`condition: no_negative_delta_this_round` 时本 tick 出过招则不回 | `07`「回合自然恢复」 |
| B5 | 招式消耗 = 呼吸法 `action_delta`（按动作标签档位，`move_overrides` 覆盖）× 成数 k/10 缩放；出招前检查核心条件 `pay_move_cost` | `11` 8.3.3 |
| B6 | 核心条件满足 → 正常结算（扣足消耗、伤害照常） | `11` 8.3.3 |
| B7 | 核心条件不满足 → `on_unsatisfied`（基本呼吸法默认）：**最终伤害降 0 + 气力扣至 0 + 仍走完整命中/招架/减伤链**（命中即叠类效果照常触发） | `07`、`11` 8.3.3 |
| B8 | 底气维持旧规则：不足 → 实扣 `min`、伤害照常、不中断 | `07`「核心条件不满足时的结算」 |
| B9 | 切换呼吸法 = 消耗 1 tick + **读取新呼吸法初始状态**（`breath_bar.initial_state.qi_li`，基本呼吸法 0） | `07`「切换」 |
| B10 | 呼吸条变动值为正（出招回气）的动作无核心条件，直接结算夹紧上限 | `11` 8.3.3 |

---

## 2. 数据层（已完成 ✅）

- `data/combat-skills.json`：
  - ✅ 全部 5 处招式 `qi_li_cost` 移除（刺拳 0.2、正蹬/摆拳/鞭腿 0.25、兵击直斩 0.2）——招式不再自带气力消耗；
  - ✅ `combat_basic_breath` 新增 `breath_bar`（`max_base: 100`、`max_growth: null`、`initial_state: {qi_li: 0}`、`regen: {pct_of_max, 0.5, no_negative_delta_this_round}`、`action_delta: {punch: -0.25 (jab→-0.2), kick: -0.25}`、`states: []`、`usage_conditions: {check: pay_move_cost, on_satisfied: normal, on_unsatisfied: {damage_result: zero, qi_li_drain: to_zero, proceed_full_chain: true}}`）；**无 `entry_full`**（进战斗不重置为满条，统一读 `initial_state`）；
  - ✅ `description` 更新。

---

## 3. 代码迁移清单（按依赖顺序）

### 3.1 `js/survival.js`（气力状态与恢复）

| 位置 | 现状 | 改为 |
|------|------|------|
| 初始状态（行 41） | `qi_li_current: 100` | `qi_li_current: 0` |
| `getQiLiMax()`（行 331-333） | `max(1, get('qi_li_max', 100))` | 读挂载呼吸法 `breath_bar`：`max_base` + `max_growth`（若有）；**未挂载 → 0**；兜底 `Math.max(0, …)`。删除对存档 `qi_li_max` 常量的直接依赖（或仅作兼容回退） |
| `initBattleResourcesFull()`（行 510-521） | `qi_li_current = qi_li_max` | **不再改动 `qi_li_current`**（常驻资源，进战斗不重置）；仅初始化底气/护体；`qi_li_spent_this_tick = false` |
| 每 tick 回气（行 1478-1486） | 每 tick：若 `!qi_li_spent_this_tick` 则回 `floor(qi_li_max × 0.5)` | 每 tick 收束判定：按 `breath_bar.regen`（type/量/条件）执行；`condition: no_negative_delta_this_round` ↔ 复用 `qi_li_spent_this_tick` 标记（本 tick 出现过 `consumeQiLi`/`drainQiLi` 则不回）；呼吸法无 `regen` 则不回 |
| `consumeQiLi`（行 530-537） | 实扣 min、标记 spent | 保留（B5/B6 满足路径扣足用）；不满足路径用 `drainQiLi`（新增，扣至 0 + 标记 spent） |
| 导出（行 1751-1755） | — | 新增：`getMountedBreath()`、`drainQiLi()`、`applyBreathInitialState()`（**切换**时读取新呼吸法 `initial_state.qi_li`，缺省 0；见 B9）。**切换的 1 tick 消耗**由 `scene-app.js` 装配处调 `applyBreathInitialState()` + `advanceTick()` 实现（见 §3.4） |

> **轮次收束点**：当前实现以「每 tick」推进（`advanceTick`）。新口径是「完整轮次」（玩家行动 + 全部敌人各行动一次）。需在战斗循环中登记「玩家行动计数 / 敌人行动计数」，双方都动完才触发一次回气；或沿用 tick 但把回气条件改为「本轮次末」——**实现以战斗主循环的回合边界为准**，需在 `scene-app.js` 的战斗 tick 流程中确认轮次边界。

### 3.2 `js/combat-melee-resolve.js`（核心条件结算，最关键）

| 位置 | 现状 | 改为 |
|------|------|------|
| `computeIntendedResourceCost`（行 231-242） | 读 `ratio_of_qi_li_max_at_10_power`（数据已删 → 落到 diqi 或 0） | **气力不再走此函数**。新增：`computeBreathMoveCost(moveId, limbTags, powerK, breathBar)` = `action_delta[档位].value × k/10`（`move_overrides[moveId]` 覆盖档位值）；正变动返回 0 消耗（无核心条件，B10） |
| 行 557 | `qiMax = getQiLiMax()` | 不变（`getQiLiMax` 已按 3.1 改） |
| 行 565 | `qiIntended = computeIntendedResourceCost(qiMax, move.qi_li_cost, powerK)` | `qiIntended = computeBreathMoveCost(...)`（B5） |
| 行 576-582 | `insufficientQi || insufficientDiqi` → **rawDamage 归 0（短路）** | 拆开处理：**气力侧**——`coreUnsatisfied = qiIntended > 0 && qiCurrent < qiIntended`，**不再在此处归零 rawDamage**；**底气侧**——删除归零（B8，伤害照常）。rawDamage 保留，最终伤害归 0 在伤害链末端由 `on_unsatisfied` 落地（B7：走完整链但最终伤害写 0） |
| 行 588-597 | 满足/不足都 `consumeQiLi(qiIntended)`（实扣 min） | 满足 → 扣足 `qiIntended`；不满足 → **气力扣至 0**（`qi_li_current = 0`，B7），并标记 `coreUnsatisfied` 供伤害落地 |
| 行 719-720（deferred commit 路径） | 同 588-597 | 同步改造 |
| 返回对象（行 610-646） | `insufficientQi/insufficientDiqi/forceZeroDamage…` | 新增/改名：`coreConditionSatisfied`、`breathMoveCost`；`forceZeroDamageByResourceInsufficient` 删除或仅用于兼容日志 |

> **「最终伤害降 0」的落地位置**：走完整命中/招架/减伤链后，在写 HP 前，若 `coreConditionSatisfied === false`，`finalDamage = 0`（但「命中即叠」类效果——失衡/试探/驱散——已在链中按命中结果触发，不受影响）。**不是**短路跳过命中 roll。

### 3.3 `js/combat-hub-actions.js`（吐纳遗留）

| 位置 | 现状 | 改为 |
|------|------|------|
| `resolveEffectType`（行 63-68） | `qi_li_restore` → `restore_qi_li` | 保留分支但**无数据源**（JSON 已无该字段）；建议删除或标记 deprecated（吐纳取消，见 `19` §6.4） |
| `tryExecuteRestoreQiLi`（行 70-82） | 回气动作 | 与吐纳一并废弃；`scene-app.js` 行 1405/1616 的 `qi_li_restored` 展示可保留兼容 |

### 3.4 `js/scene-app.js`（显示与战斗边界）

| 位置 | 现状 | 改为 |
|------|------|------|
| 行 2049-2050（呼吸条 HUD） | `qi_li_max` 兜底 100 | 未挂载呼吸法时**不渲染呼吸条**（B1；配合 `special_battle_sense` 解锁逻辑保留） |
| 行 1108-1109、10561-10562（进战斗） | `initBattleResourcesFull()` | 不变（函数内部已按 3.1 改：**不再重置气力**，只初始化底气/护体）；**呼吸法切换**在装配处（行 ~9892）调 `applyBreathInitialState()`（读新呼吸法 `initial_state`）后再 `advanceTick()` 消耗 1 tick |
| 战斗 tick 流程 | 每 tick 推进 | 确认「完整轮次」边界，回气挂在轮次收束点（3.1） |

---

## 4. 行为对照表（旧 → 新）

| 场景 | 旧行为 | 新行为 |
|------|--------|--------|
| 未挂呼吸法 | qi_li_max=100，招式照扣气力 | 无呼吸条，耗气力招式不可用（B1） |
| 进战斗 | 满条 100 | 不重置（常驻资源；进战斗保留当前值，B3） |
| 回气 | 每 tick，未消耗则回 50% | 每完整轮次，按 `regen`（默认 50%、条件未消耗）（B4） |
| 招式气力消耗 | 招式 `qi_li_cost` 比例 | 呼吸法 `action_delta` 按标签档位 × 成数（B5） |
| 气力不足 | 伤害归 0（短路、不扣气力） | **走完整链、最终伤害 0、气力扣至 0、命中即叠照常**（B7） |
| 底气不足 | 伤害归 0（同上被合并） | 实扣 min、伤害照常（B8） |
| 吐纳 | 动作菜单回 50 气力（冷却） | 已取消（`19` §6.4） |
| 切换呼吸法 | （无此概念） | 1 tick + 读取新呼吸法 `initial_state`（B9） |

---

## 5. 验证用例（迁移验收）

1. **无呼吸法**：角色无 `hubs.breath` → HUD 无呼吸条、耗气力招式不可释放（B1）。
2. **进战斗**：挂载基本呼吸法后进战斗 → `qi_li_current` **保持切换后的值**（不重置；反复进出战斗不改变气力）（B3）；战斗中切换其它呼吸法 → 扣 1 tick 且 `qi_li_current = 新呼吸法 initial_state.qi_li`（基本呼吸法 → 0）（B9）。
3. **消耗**：刺拳（挥拳档 −20%）10 成 → 应扣 `clamp(floor(100×0.2),1,50)=20`；正蹬（踢击 −25%）10 成 → 25（B5）。
4. **核心条件不满足**：气力 10 时出刺拳（需 20）→ 命中/招架链照走、最终伤害 0、`qi_li_current` 变 0、鞭腿「失衡」/刺拳「试探」若命中仍叠（B7）。
5. **回气**：每个 tick 收束判定——本 tick 未出招 → 回 `floor(100×0.5)=50`（非战斗 tick 同样回气，常驻资源）；本 tick 出过招 → 不回（B4）。
6. **底气对照**：底气不足出正蹬 → 实扣至 0、伤害照常（B8）。
7. **吐纳**：动作菜单无「吐纳」条目（B-19 §6.4）。

---

## 6. 连带确认项（非本次改动）

- **敌人还击**（`resolveEnemyVsPlayerAttack`，行 652-683）：已不吃技能侧乘区（威力 min/max 随机直出，符合 `10` D）；是否乘暴击/环境取决于敌人模板字段（`10` 说「若配置」），当前模板无暴击字段 → 按 1，符合。
- **`computeIntendedResourceCost` 保留给底气**：底气仍走方案 1 公式（B8），函数可留作底气专用并删去 `ratio_of_qi_li_max_at_10_power` 分支。
- **存档兼容**：旧档 `qi_li_current` 存在时按 `getQiLiMax()` 夹紧（survival.js 行 316 已做）；新档未挂呼吸法时按 0 处理。

---

*迁移清单 v1：设计定稿后整理，供战斗主循环实现直接对照。*
