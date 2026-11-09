# 战斗规则、实现与验证映射

核对日期：2026-11-08。本表区分设计规则、已运行实现与回归入口；“已有测试”表示覆盖有关场景，不表示穷尽全部组合。文件名下的测试均位于 `tools/`。

## 正本优先关系

- 07/08 是早期基础描述；当前伤害顺序以 **49** 为准。
- 07/08/49 的旧击退描述由 **61** 的整次动作、立即位移/撞墙规则覆盖，不恢复按段末刻击退。
- **70** 顶部当前运行时说明以及 `docs/design/weapon-forging-runtime.md`、`docs/design/combat-metaskill-runtime.md` 优先于其历史“尚未实现”段落。
- **82** 当前死亡流程覆盖 09 的旧复活占位说明。肌肉奖励以 **34** 最新条款为准。

## 对照表

| 规则 | 设计正本 | 当前拥有者与关键接口 | 回归入口 |
|---|---|---|---|
| 敌人、NPC/设施、移动意图分流；占格与换图 | 07、场景/设施规则 | `SceneMovement.tryMoveTo/tryIntentMove`；`GameEngine.moveTo/canStandAt/jumpTo` | `test-combat-map-transition.mjs`、`test-outdoor-facilities.mjs`、`test-npc-interaction-checks.mjs` |
| 转向 0 刻，步行/等待 1 刻；拒绝不付资源，跳跃单独付 1 刻 | 07、61 | `SceneMovement`、`GameEngine`、`Survival` | `test-scene-entry-runtime.mjs`、`test-movement-reserves.mjs`、`test-direction-indicator.mjs` |
| 世界刻、行动锁、设施结算顺序 | 06、设施各正本 | `WorldTick`、`SceneAccess`、`Survival.advanceTick` | `test-facility-world-time.mjs`、`test-gym-runtime.mjs`、`test-sleep-runtime.mjs` |
| 交战状态与脱战、地图敌人生命周期 | 07 | `CombatEngagement`、`CombatWorld`、`CombatExchange` | `test-combat-engagement.mjs`、`test-combat-map-transition.mjs` |
| 一轮交战选肢/选招、独立兵器轮转、受伤后重选 | 07、70 | `CombatExchange.attackEnemy`；私有 `pickWorldMeleeAttackIntent`；`InventoryEquipment`、`CombatMetaskills` | `test-modular-weapon-scene.mjs`、`test-combat-metaskills.mjs`、`test-enemy-body-runtime.mjs` |
| 速度、强制先手、同速快照与双方提交 | 07、34、49 | `CombatInitiative`、`CombatExchange`、`CombatPipeline.finalizeSimultaneous` | `test-modular-weapon-scene.mjs`、`test-muscle-calf-rewards.mjs`、`test-player-death-combat.mjs` |
| 速度重复攻击与一招多段的区别 | 07、49、70 | `CombatExchange` 重复交战；`CombatMeleeResolve` / `CombatPipeline` 处理 `hit_segments` | `test-modular-weapon-scene.mjs`、`test-combat-metaskills.mjs`；见下方已知差异 |
| 招式 1–12 成功力、底气倍数、气力、失败不扣与收尾扣除 | 49、70 | `CombatMeleeResolve.computeCosts/resolve/finishActionResources`、`CombatDamage` | `test-combat-resource-costs.mjs`、`test-breath-burst.mjs`、`test-modular-weapon-combat.mjs` |
| 基础伤害、先天超额、熟练度、肢体肌肉加成、最终取整 | 34、49 | `CombatDamage`、`CombatSkills.getMovePowerProfile`、`CombatMeleeResolve` | `test-combat-damage-runtime.mjs`、`test-jab-power-range.mjs`、`test-enemy-attack-power-ranges.mjs`、`test-muscle-limb-damage.mjs`、`test-muscle-hand-rewards.mjs` |
| 平值/比例附伤、转伤、进攻整招快照与防守逐段更新 | 49 | `CombatDamage.typed/defend`、`CombatPipeline.prepareAction/prepareSegment`、`CombatMeleeResolve` | `test-combat-damage-runtime.mjs` |
| 命中速度、前后朝向与部位 | 08、49 | `CharacterAttributes.getHitRate`、`CombatPipeline`、`CombatMeleeResolve` | `test-combat-damage-runtime.mjs`；朝向显示另见 `test-direction-indicator.mjs`，显示测试不能替代全部命中概率组合 |
| 招架资格、占肢、全局奖励、唯一总上限 | 08、34、70 | `CombatParry`、`CombatPipeline`、`InventoryEquipment`、`Muscles` | `test-footwork-parry.mjs`、`test-parry-variant-retirement.mjs`、`test-muscle-thigh-rewards.mjs`、`test-muscle-chest-rewards.mjs` |
| 步法、装备/头盔、柔韧、类型承伤与颈部末段独立减伤 | 34、37、49 | `CombatDamage.defend`、`CombatPipeline`、`InventoryEquipment` | `test-combat-damage-runtime.mjs`、`test-muscle-neck-rewards.mjs` |
| 爆气、突进、距离、整招击退、撞墙追加伤害/眩晕 | 61、34、37 | `CombatBreath`、`CombatWorld`、`CombatPipeline.finishAction`；`CombatExchange` 后续距离重检 | `test-breath-burst.mjs`、`test-combat-resource-costs.mjs`、`test-combat-fx-breath.mjs`、`test-muscle-neck-rewards.mjs` |
| 部位损毁/失能、动态上限、疼痛与眩晕 | 09、34、37、72 | `CharacterAttributes`、`InventoryEquipment`、`Enemies`、`Survival` | `test-enemy-body-runtime.mjs`、`test-muscle-head-rewards.mjs`、`test-muscle-thigh-rewards.mjs`、`test-muscle-chest-rewards.mjs`、`test-muscle-abdomen-rewards.mjs`、`smoke-pain.mjs` |
| 单手兵器四位置、耐久、独立防御轮转、同速磨损 | 70、锻造运行时说明 | `ModularWeaponCombat`、`ForgingRules`；界面 `CombatPanel` | `test-modular-weapon-combat.mjs`、`test-modular-weapon-scene.mjs`、`test-forging-integration.mjs` |
| 元技能 FIFO、替换/追加、不递归、免耗、冷却、存档 | 70、元技能运行时说明 | `CombatMetaskills`、`CombatExchange`、`SaveSystem` | `test-combat-metaskills.mjs`（测试目录注入元技能；正式目录仍为空） |
| 要害死亡、同速双死、单次惩罚、死亡事务与复活/重入 | 82 | `DeathSystem`、`CombatPipeline`、`SaveSystem`、`DungeonRuntime` | `test-player-death-combat.mjs`、`test-death-system.mjs`（原生及 `--svelte`）、`test-combat-map-transition.mjs` |

## 需单独处理的设计/实现差异

**普通徒手的速度重复攻击。** 07 的速度优势连击描述是通用规则；当前 `CombatExchange.attackEnemy` 中的 2–4 次重复受 `modularExchange` 条件控制（兵器、元技能计划或元技能绑定）。没有这些条件的普通徒手不进入相同重复循环。多段 `hit_segments` 不等价于按速度重复整次攻击。这是迁移前已存在的差异，本轮保留行为，不能据此宣称全部战斗设计已完全实装。后续应单独决定统一规则并补普通徒手双方速度边界回归。

**设计完成与内容投放有区别。** 当前已运行单手兵器四位置与元技能框架；正式元技能目录尚空。双持、长柄/双手的完整内容、正式兵器技能与获取投放，以及手术降低损毁上限等尚不能按已完成实现验收。此次重构不擅自补完这些规则或数值。

**重复结算风险点必须保留。** 同速双方先锁定，提交后再统一位移与死亡清理；颈部减伤、眩晕增量、资源与磨损不能在预览和提交各算一次。既有存档奖励按点亮派生，重复读档不累计。
