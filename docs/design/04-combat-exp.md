# 四、实战经验值

- 战斗胜利获得，线性累计，上限 **1000 亿**；每 1 亿 +5% 全局伤害，线性增长（即全局伤害加成 = 实战经验值 / 1 亿 × 5%）。
- 永不回退；实战经验远高于某敌人时，再打该弱敌不再获得实战经验。

**实现（与伤害链对齐）**：存档字段 **`combat_experience`** 挂在 **`InventoryEquipment`** 顶层（随 `getState` / `setState` 持久化）。玩家近战 raw 乘子 **`getCombatExperienceDamageMultiplier()`** = `1 + clamp(值) / 1e8 × 0.05`；发放经验由系统调用 **`addCombatExperience(delta)`**（如战斗胜利结算，待各玩法接线）。
