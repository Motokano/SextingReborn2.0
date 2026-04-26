# 生存 Buff 管线回归清单（入口 + 属性 + 死亡链路）

本清单用于验收“生存效果由 Buff 管线驱动”的统一口径，覆盖 `satiety/thirst/nutrition/mood/body_temperature` 与门禁边界。  
本文件是执行清单，不替代 `06-survival.md` 与 `18-buff-system.md` 的设计正本。

---

## 1) 验收前置（必须先过）

- [ ] 仅存在一套生存字段真相：`Survival.state`（无并行状态源）。
- [ ] 三个 survival 事件已作为统一监听口：
  - [ ] `survival_state_changed`
  - [ ] `mood_state_changed`
  - [ ] `body_temperature_state_changed`
- [ ] `data/editor/buff_event_registry.json` 已登记以上事件名与相关 tag。
- [ ] `disable_movement` / `disable_actions(move)` 边界一致：
  - [ ] 仅禁移动；
  - [ ] 不隐式禁战斗/制作/对话；
  - [ ] 其它禁用动作需显式写在 `disable_actions`。

---

## 2) 事件口径回归（按事件逐条核对）

### 2.1 `survival_state_changed`

- [ ] `event_kind=survival`
- [ ] `event_name=survival_state_changed`
- [ ] `tags` 含 `survival/state/player/survival_state`
- [ ] `payload` 含：
  - [ ] `reason`
  - [ ] `changed_fields`
  - [ ] `before`
  - [ ] `after`
  - [ ] `extra`
- [ ] 仅在字段实际变化时触发（无变化不触发）。

### 2.2 `mood_state_changed`

- [ ] `event_kind=survival`
- [ ] `event_name=mood_state_changed`
- [ ] `tags` 含 `survival/mood/state/player`
- [ ] `payload` 含 `old_range/new_range/mood`
- [ ] 分段切换时触发；同段内数值波动不重复触发。

### 2.3 `body_temperature_state_changed`

- [ ] `event_kind=survival`
- [ ] `event_name=body_temperature_state_changed`
- [ ] `tags` 含 `survival/temperature/state/player` + 三选一：
  - [ ] `temp_extreme_cold`
  - [ ] `temp_extreme_hot`
  - [ ] `temp_comfort`
- [ ] `payload` 含：
  - [ ] `old_range/new_range`
  - [ ] `body_temperature/body_temperature_standard`
  - [ ] `ambient_temperature/weather_resist_shift`

---

## 3) 属性回归（按入口执行）

### 3.1 道具/效果入口（`survival_delta`）

- [ ] `satiety/thirst/nutrition` 正负变化后，字段夹紧与分段正确。
- [ ] `stamina` 字段仅表示体力；`energy` 仅表示精力（不混用）。
- [ ] 同步触发 `survival_state_changed`，且 `changed_fields` 与实际一致。

### 3.2 Tick 推进入口

- [ ] 饱食自然衰减、生存分段、门禁一致。
- [ ] 饮水自然衰减、缺水死亡计时一致。
- [ ] 营养衰减与档位效果一致。
- [ ] 心情回归与分段 Buff 同步一致（low/normal/high）。
- [ ] 体温极端判定、漂移、状态 Buff 同步一致（cold/hot/comfort）。

### 3.3 地图温度入口

- [ ] 地图读取优先级：
  1) `ambient_temperature_by_season[currentSeason]`
  2) `ambient_temperature`
  3) `null`（comfort）
- [ ] 缺省温度地图会回归 comfort，不误触发极端状态。

---

## 4) 入口门禁回归（动作边界）

### 4.1 生存门禁

- [ ] 重度饥饿/体力为 0 时，仅禁“需要资源”的动作，不误禁纯 UI 操作。
- [ ] 缺水（`thirst=0`）时 NPC 交互门禁生效，补水后解除。

### 4.2 Buff 控制门禁

- [ ] `disable_movement` 可禁止移动，其他入口不受影响。
- [ ] `disable_actions(move)` 行为与上条一致。
- [ ] `disable_actions` 指定其它动作（如 `combat` / `craft` / `dialogue`）时，仅影响目标动作，不扩散到未声明动作。

---

## 5) 死亡链路回归（必须逐条）

### 5.1 饱食死亡链

- [ ] `satiety=0` 连续计时达到阈值后死亡。
- [ ] 中途恢复 `satiety>0` 可中断并重置计时。

### 5.2 缺水死亡链

- [ ] `thirst=0` 连续计时达到阈值后死亡。
- [ ] 中途补水恢复后计时重置。

### 5.3 体温死亡链

- [ ] 低温死亡判定：`body_temperature <= body_temperature_standard - body_temperature_death_below_standard`
- [ ] 高温死亡判定：`body_temperature >= body_temperature_standard + body_temperature_death_above_standard`
- [ ] 死亡后状态、日志与后续惩罚流程一致。

---

## 6) 回归结论模板（执行后填写）

- [ ] 事件口径一致（3/3 通过）
- [ ] 属性链路一致（satiety/thirst/nutrition/mood/temp 全通过）
- [ ] 门禁边界一致（disable_actions/disable_movement 无歧义）
- [ ] 死亡链路一致（饱食/缺水/体温 全通过）
- [ ] 未发现并行真相与命名漂移
