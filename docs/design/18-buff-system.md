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

