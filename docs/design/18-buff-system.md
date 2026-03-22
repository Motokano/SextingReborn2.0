# 十八、Buff / Debuff 系统（通用触发 + 分层消耗）

本模块定义统一 Buff/Debuff 口径：以 `tick` 为主、同类可叠加、可被任意动作/事件/对话触发，并支持“固定层数消耗”的分层 Buff。

---

## 18.1 目标与范围

- 统一“增益/减益/控制/规则变更”在数据层与结算层的表达。
- 统一触发入口：战斗动作、地图交互、剧情事件、对话分支均可调用同一接口。
- 支持两类消耗口径：
  - 不管是否命中都消耗；
  - 命中判定成功后才消耗（本项目采用此口径时，命中判定成功即算命中，即使后续被招架导致 0 伤害）。
- 支持 1 tick 内多次攻击结算（连击/多段）并逐次对齐 Buff 触发与消耗。

---

## 18.2 Buff 类型分层

### A. 数值型（Stat Modifier）

- 作用：后天五维、命中、速度、底气相关恢复/上限等数值修正。
- 实现：Buff 增删/过期后进入统一重算入口（如 `recalcCharacterStats()`）并刷新缓存。

### B. 状态/控制型（Control / State）

- 作用：限制行动、限制移动、动作标签增减、临时功能封禁等。
- 实现：在动作可执行判定阶段读取当前状态。

### C. 规则型（Rule Modifier）

- 作用：改写判定规则（如伤害类型变换、招架封顶突破、特殊触发链等）。
- 实现：在对应结算阶段读取并应用。

### D. 通用分层触发型（Layered Trigger Buff）

- 核心特征：有层数、可叠加、可固定层消耗、可由任意事件触发。
- 适合：护盾层、反制层、受击/出招触发层、剧情标签层等。

---

## 18.3 数据结构（建议字段）

```ts
type BuffInstance = {
  uid: string;                  // 实例唯一 ID
  buff_id: string;              // 模板 ID
  owner_id: string;             // 宿主角色 ID
  source_id?: string;           // 来源（技能/道具/事件）
  started_tick: number;
  expires_at_tick: number;      // 推荐优先存 expires_at_tick

  stacks: number;               // 当前层数
  max_stacks: number;           // 最大层数（超出后夹紧）

  // 触发过滤
  listener_side: "self" | "actor" | "target" | "both";
  trigger_event_kind: string[]; // combat/action/dialogue/world/ui...
  trigger_event_name: string[]; // attack_resolved/dialogue_choice_confirmed...
  trigger_tags?: string[];      // 可选标签过滤

  // 消耗规则
  consume_mode: "always" | "on_hit_roll_success" | "on_effect_applied";
  consume_layers_fixed: number; // 每次触发固定消耗

  // 触发效果
  apply_mode: "tie_to_consume" | "always_apply";
  effects: EffectEntry[];
  priority: number;             // 同事件内执行顺序（小到大）
};
```

### 18.3.1 `effects[]` 扩展类型（数据声明）

除既有的 `add_stat_delta`、`trigger_event` 外，可增加 **规则型** 声明，供战斗/动作结算读取（通用流水线未必会执行其数值，以各子系统文档为准）。

### 18.3.2 可被「破相」等效果驱散的增益池（Buff 模板字段）

- **用途**：后遗症 **「破相」**（`post_po_xiang`，`effect_type` = **`dispel_one_beneficial_buff_on_target`**）等在 **命中判定成功** 时，从**防守方**当前 Buff 实例中移除 **1** 条**可驱散增益**。
- **模板字段（建议）**：在 `/data/buffs.json` 各条 Buff 上可选  
  - **`dispel_pool`**：字符串枚举；**`beneficial`** 表示可被本类驱散逻辑选入候选池；**缺省或空**表示**不可**被「破相」选中（剧情锁、环境领域、永久诅咒等应不填或显式 `none`）。
- **选中规则**：在目标身上、满足 **`dispel_pool === "beneficial"`** 且仍有效的实例中，按模板 **`dispel_priority`**（数值，**越小越优先被驱散**；缺省视为较大）排序，取**最优先的一条**移除**整实例**；**同优先级**时按实现约定（如 `started_tick` 较早、或稳定随机）。
- **时机口径**：与 **`on_hit_roll_success_apply_buff_target`**（鞭腿失衡）一致——**命中 roll 成功**即进入可触发路径；**之后**即使招架使**最终伤害为 0**，**仍执行驱散**。**命中失败**不驱散。
- **登记**：新增 `effect_type` / 驱散相关 `event_name` 若需接入通用 Buff 管道，须在 **`/data/editor/buff_event_registry.json`** 登记后再用于配置引用。

#### `multiply_w_coef_factor`（徒手威力系数乘子，试探示例）

- **用途**：声明「在 \(W_{\text{skill}}\times G\) **之后**再乘一个与层数挂钩的因子」，并限定 **招式 `move_id`**。  
- **建议 `params` 字段**：

```json
{
  "type": "multiply_w_coef_factor",
  "params": {
    "order": "after_g",
    "move_id": "swing_punch",
    "base": 1,
    "per_stack": 0.05
  }
}
```

- **语义**：当本击 `move_id` 与 `params.move_id` 一致、且宿主持有该 Buff 实例层数 \(s\) 时，令  
  \(K = \texttt{base} + \texttt{per\_stack} \times s\)（与 `11-skills.md` 8.3.2 中 \(K_{\text{试探}} = 1 + 0.05s\) 对齐）。  
- **`order`**：预留与将来更多乘区排序；当前已定稿为 **`after_g`**（紧接手套 \(G\) 之后）。  
- **实现**：战斗侧在合成 \(W_{\text{coef}}\) 时读取模板；若 Buff 带 **`probe_pipeline_manual`**（见 `18.13`），仍由战斗显式参与结算，**不**依赖仅扫描触发的自动流水线。

#### `parry_chance_delta_percent`（招架几率百分点，失衡示例）

- **用途**：按 **层数** 累加对 **最终招架几率** 的**百分点**修正（在 `08` 柔韧与默认硬上限之后应用）。  
- **建议 `params`**：`delta_per_stack`（number，如 **-5** 表示每层 −5 个百分点）。总修正 \(\Delta p = \texttt{delta\_per\_stack} \times \texttt{stacks}\)。  
- **实现**：`BuffSystem.getParryChanceDeltaPercent(ownerId)` 遍历该宿主实例上所有本 effect 并求和；战斗在招架判定时读取。模板宜配 **`off_balance_pipeline_manual`** 等 tag，避免被泛事件误匹配（同 `probe_pipeline_manual` 思路）。

---

## 18.4 叠加与生命周期（已确认口径）

- 同类 Buff 可叠加：`stacks += addStacks`。
- `duration` 叠加时：**重置持续时间**（`expires_at_tick` 按新持续重算）。
- 超过 `max_stacks`：**夹紧**到 `max_stacks`。
- 每次触发消耗：固定值 `consume_layers_fixed`。
- 若层数不足：扣到 0 为止，不出现负数。
- 层数扣完：**立即删除整个 Buff 实例**（不保留空壳）。

---

## 18.5 统一事件触发接口（对所有系统开放）

### 统一入口

```ts
triggerBuffPipeline(eventContext: BuffEventContext): void
```

### 事件上下文建议

```ts
type BuffEventContext = {
  event_id: string;             // 同一次动作/结算链唯一 ID，用于防重
  tick: number;

  event_kind: "combat" | "action" | "dialogue" | "world" | "ui";
  event_name: string;
  tags?: string[];

  actor_id?: string;
  target_id?: string;

  hit_roll_success?: boolean;   // 命中判定是否成功（本项目 onHit 用此字段）
  effect_applied?: boolean;     // 是否对目标产生实际效果
  damage_applied?: number;      // 可选，便于扩展与调试
};
```

### 接口开放范围（强制）

- 战斗动作（普通攻击、技能、多段、连击、反击）
- 移动/交互/物品使用/等待
- 地图事件、机关事件、任务事件
- 对话事件（选项确认、分支进入、分支结算）

任何系统只要能产出 `BuffEventContext`，即可进入统一 Buff 流水线。

---

## 18.6 多段/连击与 1 tick 多次攻击对齐（强制）

- 允许在同一 `tick` 内发生多次攻击结算（例如 2 连击、3 连击、多段招式）。
- 每一段攻击都必须发出**独立事件**（独立 `event_id`）。
- 分层 Buff 对每段独立触发、独立判定、独立消耗。
- 禁止把同一 tick 内多段攻击合并成一次 Buff 消耗。

---

## 18.7 执行顺序（强制）

同一个事件命中 Buff 流水线时，按以下顺序执行：

1. 过滤候选 Buff（事件类型/名称/标签/监听侧）
2. 按 `priority` 排序
3. 先判断是否触发消耗条件（`consume_mode`）
4. **先扣层数**
5. 再应用效果（按 `apply_mode` 决定是否应用）
6. 若 `stacks <= 0` 立即移除

> 本项目口径：**优先层数**（先扣层，再应用效果）。

---

## 18.8 命中口径（已确认）

当 `consume_mode = on_hit_roll_success`：

- 使用 `hit_roll_success` 作为唯一命中判据。
- 即使命中后被招架导致最终伤害为 0，只要命中判定成功，仍视为“命中触发消耗”。

---

## 18.9 调试与可观测性（仅开关开启时显示）

### 调试开关（建议）

- `buff_debug_enabled`（默认 `false`）
- `buff_debug_verbose`（默认 `false`，可选）

### 开关关闭时

- 不输出 Buff 触发明细日志，不展示调试面板明细。

### 开关开启时

- 允许输出以下调试信息：
  - 事件：`event_id/event_kind/event_name/tick`
  - 命中字段：`hit_roll_success/effect_applied/damage_applied`
  - 命中 Buff：`buff_id/uid/stacks_before/stacks_after/consumed/effect_result`

---

## 18.10 性能与存档建议

- 事件触发建议使用索引（按 `event_name`/`event_kind`）避免全量扫描。
- 存档建议保存 `expires_at_tick` 而非仅剩余时长，减少跨 session 漂移。
- Buff 增删改统一走单入口，避免旁路写入导致状态不一致。

---

## 18.11 Agent 实现约束（与规则文件一致）

- 后续 agent 修改 Buff 逻辑时，必须遵守本文件口径。
- 若发现旧实现与本文件冲突，优先按本文件修正并补迁移说明。

---

## 18.12 事件注册约定（先注册，再定义，再调用）

为保证策划可视化配置与运行时口径一致，新增或修改 Buff 触发点时，必须遵守以下顺序：

1. **先注册**：将事件大类/事件名/标签写入 `data/editor/buff_event_registry.json`。
2. **再定义**：在 `data/buffs.json` 中使用已注册的 `triggerEventKind` / `triggerEventName` / `triggerTags` 配置 Buff。
3. **后调用**：在运行时代码触发事件时，使用同名的 `event_kind` / `event_name` / `tags` 调用统一 Buff 触发接口。

### 强制要求

- 任何新增的动作、事件、对话分支，只要可能触发 Buff，必须先补注册表。
- 禁止“代码里直接发新 event_name，但注册表未登记”的做法。
- 编辑器优先展示注册表选项；手填仅用于临时调试，正式入库前必须补注册。

### 目的

- 让不会写代码的策划能在编辑器下拉中直接找到可用事件并复用；
- 降低命名漂移（同一事件多个拼写）导致的触发失败；
- 便于后续在 debug 模式下做“未注册事件名”告警。

---

## 18.13 编辑器与战斗调用约定（推荐）

### 为什么需要单独约定

- **编辑器**：下拉选项应来自 **`buff_event_registry.json`**，事件名宜**细**不宜粗，便于表达「roll 后」「伤害落地后」「多段收束」等不同时机。  
- **运行时**：像 **`buff_probe`** 这类规则型 Buff，**叠层 / 整实例清空 / \(W_{\text{coef}}\)** 仍主要由**战斗结算**按 `11-skills` 执行；管道只处理「将来可声明化」的部分，避免策划误以为只配表不写战斗钩子。

### 战斗事件命名（优先使用已注册名）

| 时机（建议） | `event_kind` | `event_name` |
|-------------|--------------|--------------|
| 命中判定已出 | `combat` | `attack_hit_roll_resolved` |
| 伤害（含 0）已写入 | `combat` | `attack_damage_applied` |
| 某一 sub-hit 整段结束 | `combat` | `attack_subhit_resolved` |
| 同一 cast 全部 sub-hit 结束 | `combat` | `attack_multi_hit_finished` |

每次触发须带 **唯一** `event_id`（`18.6`）。`tags` 建议携带语义标签，如 **`move_jab`**、**`move_swing_punch`**、**`subhit`**、**`multi_hit`**，便于编辑器检索与条件过滤。

### `probe_pipeline_manual`（原魔法 tag 的编辑友好名）

- 含义：该 Buff **不会**被「只有 `event_kind`+`event_name`、但**不带**本 tag」的泛事件误触发；战斗若**刻意**走管道扩展，须在 `tags` 里带上 **`probe_pipeline_manual`**。  
- **`buff_probe` 的 `triggerTags`** 仅含此 tag 时，日常未带该 tag 的 combat 事件**不会**匹配到该模板，从而避免误跑通用扣层逻辑。

### 建议的 `payload` 字段（可选，供战斗与调试）

在 `BuffEventContext.payload` 中约定常用键（编辑器可生成骨架，运行时可忽略未知键）：

- **`move_id`**：`jab` / `swing_punch` / …  
- **`cast_instance_id`**：同一招式 cast 的稳定 id（多 sub-hit 共享）。  
- **`subhit_index`**：从 0 或 1 起的段序号（项目内统一一种即可）。  
- **`is_last_subhit`**：是否本 cast 最后一 sub-hit。  
- **`hit_roll_success`**：仍优先用上下文顶层字段；`payload` 内可不重复。  
- **`damage_final`**：本段最终伤害（可为 0）。

### `BuffSystem` 推荐调用组合

- **叠层**：`applyBuff(actorId, 'buff_probe', sourceId, eventContext)`（内部已按模板 **重置持续**、**叠层夹紧**）。  
- **整实例移除（试探清空）**：`removeBuffByBuffId(actorId, 'buff_probe')`（或等价封装）。  
- **读规则型 effect（如 `multiply_w_coef_factor`）**：`getBuffTemplate('buff_probe')` 取模板后遍历 `effects`。  
- **需要让管道也收到同一节拍时**：`triggerBuffPipeline({ ... event_name, tags: ['probe_pipeline_manual', 'move_swing_punch', ...] })`（**须已注册**）。

