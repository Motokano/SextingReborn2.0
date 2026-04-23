## 十、实现约定（技术栈、配置与存档）

- **技术栈**：JavaScript；视觉效果使用 **Canvas** 渲染。
- **配置表**：游戏物品、技能、人物属性等需策划配表的数据使用 **JSON 文件**，存放于项目 **`/data/`** 目录；**按系统/类型分表**（一张张表分开），如全局常数、武器、技能等各用独立 JSON。
- **全局常数表（筋骨/负重/超重）推荐字段**：实现时从配置表读取，表结构可增删；以下为当前公式所用常数的推荐字段名与约定值，供建表与读表参考：

  | 含义 | 推荐字段名 | 当前约定值 / 说明 |
  |------|------------|-------------------|
  | 基础负重(kg) | `base_carry_weight_kg` | 25 |
  | 筋骨负重系数（每点筋骨 +x% 总负重） | `jingu_carry_weight_pct_per_point` | 0.0005 |
  | 力量负重系数（每级力量 +x% 总负重） | `strength_carry_weight_pct_per_level` | 0.01 |
  | 基础移动体力（未超重时每格消耗） | `move_energy_cost_base` | 1 |
  | 超重体力系数 k（每超 10% 加 k×0.1 体力） | `move_energy_overweight_k` | 20 |
  | 兵器先天筋骨超额增伤系数（每超 1 点 +x%） | `weapon_innate_jingu_bonus_pct_per_point` | 0.05 |
  | 呼吸每点对底气上限加成（+x%） | `breath_diqi_cap_pct_per_point` | 0.01 |
  | 身手每点对速度加成（+x%） | `dexterity_speed_pct_per_point` | 0.005 |
  | 未挂载步法 hub 时默认 \(V_{\text{base}}\) | `base_speed_no_footwork`（兼容旧键 `base_speed_no_qinggong`） | 1 |
  | 命中率同速时基础值 | `hit_base_at_equal_speed` | 0.825（80%～85% 内） |
  | 命中率基础上限（仅速度，<1） | `hit_base_max` | 0.95 或 0.98 |
  | 命中率攻方慢时下限 | `hit_base_min` | 0.05～0.10 |
  | 命中率最终上限（<1） | `hit_final_cap` | 0.99 |
  | 命中率速度比曲线常数 L | `hit_curve_L` | 实现时调参 |
  | 速度比防除零常数 ε | `hit_epsilon` | 1e-6 或 1 |
  | 自修：每 tick 消耗精力 | `study_tick_energy_cost` | 1 |
  | 自修：专注基准点 | `focus_baseline` | 10 |
  | 自修：基准潜能/精力 | `study_potential_per_energy_base` | 200 |
  | 自修：每点专注对潜能/精力影响（+x%） | `focus_potential_per_energy_pct_per_point` | 0.05 |
  | 招架：柔韧倍率系数（招架几率/卸力 = 基础值×(1+系数×柔韧)） | `parry_flexibility_mult_per_point` | 0.005（每点柔韧多 0.5% 倍率） |
  | 背包重量折扣系数 \(m_{\text{背包}}\)（背包内物品计入负重时的乘数） | `backpack_weight_factor` | 0.7（即按 70% 计入） |
  | 打开背包/载具面板消耗 tick | `tick_cost_open_backpack` | 1 |
  | 关闭背包/技能面板消耗 tick | `tick_cost_close_panel` | 1（与打开一致，见二、区域结构 2.5/2.10） |
  | 与载具互转物品每次消耗 tick | `tick_cost_transfer_to_vehicle` | 1 |
  | 可挂机动作：挂机时每 tick 对应现实时间（秒） | `idle_seconds_per_tick` | 3 |

- **装备/载具配置提示**：设计**衣服**时在配置中声明口袋格数（如 2～4）。设计**背心/弹挂**时**必须声明背心格子数**（字段 `vest_slots`）。设计**背包**时**必须声明背包格子数**（`backpack_slots`）与**减重比例**（`backpack_weight_factor`，0～1，背包内物品计入负重时乘以该比例）。设计**载具**时声明载重上限 \(W_{\text{载具,max}}\) 及拖拽时施加给玩家的 debuff（如移速、体力消耗系数等）。**头部防具**与**衣服防具**须分别声明三种伤害的减伤比例：`damage_reduce_slash_pct`、`damage_reduce_pierce_pct`、`damage_reduce_blunt_pct`，均为 0～1。**所有装备均有六个词条槽位**（`enchant_slots: 6`），后续可通过附魔等手段为物品添加词条；**词条种类与作用**见 **`/data/enchant.json`**。上述 tick 成本与重量系数建议从**常数表**读取，便于调参。

**字段更名中英文对照（旧 → 新）**：为统一英文字段命名，以下旧字段名已弃用，均以右侧新字段为准：

- **基础负重(kg)**：`W_base` → `base_carry_weight_kg`
- **筋骨负重系数**：`jingu_weight_coef` → `jingu_carry_weight_pct_per_point`
- **力量负重系数**：`strength_weight_coef` → `strength_carry_weight_pct_per_level`
- **基础移动体力（未超重）**：`C_move` → `move_energy_cost_base`
- **超重体力系数 k**：`overweight_k` → `move_energy_overweight_k`
- **k_筋骨 偏移**：`k_jingu_offset` → `melee_jingu_offset`
- **k_筋骨 除数**：`k_jingu_divisor` → `melee_jingu_divisor`
- **兵器先天筋骨超额增伤系数**：`weapon_jingu_bonus_coef` → `weapon_innate_jingu_bonus_pct_per_point`

- **武器表**：武器应有属性（含 `req_innate_jingu` 等）在后续设计「武器属性」时一并汇总，再出表结构。
- **技能/招式配置**：出力相关（默认成数、**气力/底气**基础或比例消耗、体力等）以 **`skill_id`** 关联；具体为每招式一行或嵌套在技能 JSON 内，以实际策划表结构为准。
- **底气 / 气力比例消耗取整（与 `11-skills` 刺拳及同类一致）**：凡配置为「**方案 1**」的扣 **底气** 或扣 **气力值**（先定十成基准再 × 成数/10，且基准夹紧 `[min,max]`）：**步骤 A** \(B=\mathrm{clamp}(\lfloor D_{\max}\times r\rfloor,\,d_{\min},\,d_{\max})\)，其中 \(D_{\max}\) 分别为当前 `diqi_max` 或 `qi_li_max`，\(r\) 与 \(d_{\min},d_{\max}\) 来自招式配置（刺拳示例：底气 \(r=0.1\)、夹紧 \([1,50]\)；气力 \(r=0.2\)、夹紧 \([1,50]\)）；**步骤 B** \(C=B\times(k/10)\)，\(k\) 为成数；**步骤 C** 实际扣除整数 \(\max(1,\,\mathrm{round}(C))\)，再与 `diqi_current` 或 `qi_li_current` 取 min 扣减。全项目统一，勿混用「先乘成数再夹紧」或其它取整函数，除非新招式在文档中单条声明例外。
- **徒手 \(W_{\text{coef}}\) 合成顺序**：与 `11-skills` 8.3.2 一致：**\(W_{\text{skill}}\) → 招式乘子 \(M_{\text{move}}\)（`move_power_multiplier`，默认 1；刺拳 0.8、正蹬 1.2、鞭腿 1.0、摆拳 1.4，余见 `11`）→ 手套 \(G\) → 试探 \(K_{\text{试探}}\)**（仅摆拳 `swing_punch`），再与武器基础伤害相乘。
- **呼吸法威力 \(F_{\text{呼吸法威力}}\)**：挂载 **`hubs.breath`** 的技能若为 `category: breath` 且配置了 **`breath_power_multiplier`**，算伤侧调用 **`CombatSkills.getBreathPowerMultiplier(skillId, move_usage)`**（见 `11` 8.3.3、`05` 5.5.2）；**应乘入 \(W_{\text{skill}}\)**，与 `Base(L)`、招式熟练度等顺序以 `11`/`08` 为准。未挂载或非 breath：**1**。
- **三类型伤害后处理（新增）**：`resolvePlayerVsEnemyAttack` 在主公式产出 `rawDamage` + `damageType` 后进入三类型池 `typedDamage={blunt,slash,pierce}`。结算顺序固定：**前置注入（`add_flat`/`add_from_pct`）→ 首轮类型增伤（`increase_pct`）→ 单向转换（仅 `blunt_to_slash`、`slash_to_pierce`，同向多条先求和一次转换）→ 转换后二次增伤（仅新增目标类型分量）**。全程保留小数，仅 `finalDamage` 落地时 `floor`。禁止反向转换，避免递归套娃。实现接线：`js/combat-melee-resolve.js`（生成 `typedDamage`）、`js/scene-app.js`（透传上下文）、`js/combat-pipeline.js`（敌方按三类型分量减伤后汇总）。
- **词条数据字段（统一）**：推荐字段 `damage_type_effects`，子键：`add_flat`、`add_from_pct[]`、`increase_pct`、`convert_pct`。`pct` 支持 `0.2` 或 `20`（运行时归一化）。`convert_pct` 只允许 `blunt_to_slash`、`slash_to_pierce`。

### 战斗技能·呼吸法·熟练度：**已定**与**尚待实现**

#### 已定（策划已拍板；以 `11` / `19` / JSON / API 为准）

| 主题 | 依据 | 摘要 |
|------|------|------|
| 肢上招式熟练度与后天奖励 | `11` 8.3.1、`05` 5.4 | `proficiency_attr_unlocks`；`move_usage`；`recalcCharacterStats` |
| 基本拳脚分轨 | `11` 8.3.2、agent 规则 | 后遗症 vs `proficiency_attr_unlocks` |
| **基本呼吸法** 显示名 | `data/combat-skills.json`、`19` §6、`11` 8.3.3 | 全文统一 **「基本呼吸法」**；技能 ID 仍为 **`combat_basic_breath`** |
| **吐纳** 入口 | `19` §6.4、`11` 8.3.3 | **「动作」**二级菜单；**不**要求武学枢纽独立战斗条（可选快捷除外） |
| **冷却** | `19` §6 总述 | **`skills[combat_basic_breath].hub_action_cooldown_ticks[hub_action_id]`**（如 **`tu_na`**），战斗 tick 递减 |
| **熟练度累计** | `19` §6 总述 | **血气化劲 / 吐气纳精 / 调息 / 吐纳** 成功结算均 **`move_usage.tu_na` +1**；调息 **每成功 1 tick** +1 |
| **底气护体** `diqi_huti` | `19` §6.6、`11` 8.3.3、`06` 底气护体示例 | **≥50** 级；**战斗**；**\(B=\lfloor diqi_{\max}\times r\rfloor\)**，`r`=`diqi_consume_ratio_of_max`（0.5）；**\(C=\max(d_{\min},B)\)**，`d_{\min}`=`diqi_consume_min`（**1**，底气消耗下限夹紧）；**`diqi_max=0`** 整次失败 → **`shield_value=C`**；**三系 25%**（`shield_tri_type_damage_reduce_pct`）；**无 duration tick**；**护体未破不可重复开**；**不累加 `tu_na`** |
| **`getSkillTotalProficiency` hub 排除** | `11` 8.3.3、`js/combat-skills.js` | **`hub_actions[].exclude_from_skill_total_proficiency: true`** 的条目 **不参与** 算术平均（**底气护体** 已用，避免稀释吐纳对 **`breath_power_multiplier`** 的影响） |
| 呼吸法威力 | `11` 8.3.3、`getBreathPowerMultiplier` | `base` 1.0；总熟练 ≥50% → +0.3 |
| 新呼吸法 | `11` 8.3.3 | **沿用** `hub_actions` + `breath_power_multiplier` |
| 新步法 | `11` 8.3.4 | **`category: footwork`**、`hubs.footwork`、**`combat_speed_base`**、**无熟练度**、`hub_actions` 仅动作/Buff |
| **基本招架** | `11` 8.3.5、`08` 招架结算阶段、`getParryValues`、`js/combat-parry.js` | 仅招架槽；**1→满级**线性 **15%→45%** / **20%→50%**；**成功** **`move_usage.parry_success` +1**；**R≥50%** → 后天柔韧 **+40**（`parry_proficiency_attr_unlocks`）；**肢位选取 / 跳过 / 日志 / 事件** 见 `08` 与 **`CombatParry`**；registry **`parry_*`** 事件 |
| Buff/试探 | `18`、`11` | 既有规则 |

**技能存档字段补充（实现须持久化）**：在 `skills[skill_id]` 上除 **`level`**、**`move_usage`** 外，呼吸法相关可增加 **`hub_action_cooldown_ticks?: { [string]: number }`**（剩余冷却 tick）；缺省键视为 0。

#### 尚待实现（非策划缺口）

- **战斗结算接线**：\(F_{\text{呼吸法威力}}\) 乘入 \(W_{\text{skill}}\) 的代码路径；**多 hub 切换**时以 **出手前一刻** `hubs.breath` 为准（实现登记）。
- **速度先手与同时结算（`07`）**：已接线 **`js/combat-initiative.js`** + **`SceneCtx.actions.attackEnemy`**：**速度不等**时先手方先跑满管线再跑后手还击（敌人还击用 **`CombatMeleeResolve.resolveEnemyVsPlayerAttack`** + **`melee_hit_player_defender`**）；**同速**且敌人 **`can_attack !== false`** 时走 **`simultaneousDryRun`**（招式命中 Buff 入队 + 伤害入队）再 **`flushPendingBuffApplies` / `finalizeSimultaneousStrike`**；**`initiative_always_first`** 由 **`resolvePlayerInitiatedExchange`** 在**取整速度**得到先后/同速结构之后，再与强制先手互抵合成（见 `combat-initiative.js`）。**地图普攻、敌取整速度更高且非显式三件套**时，先后手解析**推迟**到还击后二次选肢完毕，再调用一次（终稿肢上的槽位后遗症）。局限：后手「失能短路」待敌人 HP/离场接入；同 tick 内其它系统对「同时提交」的观测顺序以当前 commit 为准。Agent 维护约定见 **`.cursor/rules/combat-initiative-exchange-agent.mdc`**。
- **非战斗扩展**：吐纳 **`battle_only`** 已约束；若将来大地图回气，单独立项。

### 战斗管线与后遗症分派（可扩展落地）

- **配置**：`data/combat-pipeline.json` 定义 **`pipelines.*.phases[]`**（`handler` 键、`buff_event_name` 等）。**勿在单技能 JSON 写死封顶**，招架/命中硬顶以 **`survival-config.json`** 的 `parry_chance_cap`、`parry_damage_reduce_cap`、`hit_*` 为准（`CombatPipeline.getParryCaps` 读取）。
- **实现**：`js/combat-pipeline.js` — `CombatPipeline.setConfig`、`runPipeline`、`registerPhaseHandler(handlerKey, fn)` 覆盖内置 **`builtin.*`**。`js/combat-post-effects.js` — `CombatPostEffects.setTable(post-effects.json)`、`registerPostEffectResolver(effectType, fn)`；管线阶段 **`builtin.post_effects_hook`** 对 `hit_roll_success` 分派。
- **入口**：`SceneApp` 加载配置后注入管线；**`attackEnemy`** 默认跑 **`melee_hit_enemy_defender`**，可通过 **`ctxMeta.pipeline`** 换 **`melee_hit_player_defender`**（演示/受击）；**`ctxMeta.post_effect_ids`** 传入装配的后遗症 id 列表。
- **策划填表字段**：`combat-skills.json` 的 **`constants.design_meta_template`**；技能根、`moves[]`、`hub_actions[]` 可选 **`design_meta`**。`post-effects.json` 条目可选 **`design_meta`**、**`mechanic_shared_with_enemy`**（与 `10-enemies`「共用机制」一致）。

---

（以下仍为第十节全局实现约定条目。）

- **招架几率 Debuff**：失衡等按 `08` 在最终几率上叠加百分点；运行时可用 **`BuffSystem.getParryChanceDeltaPercent(ownerId)`**。
- **正蹬 tick 末击退**：招式配置 **`on_parry_failed_at_tick_end_displace_target`**（`cells`、`direction`、可选 **`wall_slam_final_damage_multiplier`**）：**命中成功**且 **`08` 招架失败**时入队；**tick 末**按 **`07`** 全局规则 **坍缩为至多一条**（**`cells` 最大子集** → **攻击方筋骨低** → **攻击方速度取整低** → **`event_id` 小**）执行位移；**撞阻**时 **`08` 第 5 条** 对本击最终伤害乘子（正蹬 **1.3**）。见 `11-skills` 8.3.2、`07`、`08`。
- **战斗调试日志**：试探层数、\(W_{\text{skill}}\)、\(G\)、\(K_{\text{试探}}\)、\(W_{\text{coef}}\) 等细粒度威力拆分，**仅当** `buff_debug_enabled`（或项目内等价全局开关）为真时输出；默认关闭（与 `18-buff-system.md` 调试可见性一致）。
- **技能 ID 与显示名**：ID → 显示名（如 `survival_strength` → 「力量」）的映射放在 **`/data/` 下技能配置表**中，每条技能包含 `id` 与显示名字段（如 `name` 或 `display_name`），便于通过读表/写表维护与扩展。
- **展示用文案**：所有需展示的文案（技能名、物品名、UI 按钮与提示、系统说明等）均从 **配置表/文案表**（如 `/data/` 下 JSON）读取，通过 **key** 引用，不写死在代码中，便于通过读表/写表维护与 agent 修改；多语言与表结构（如按模块拆表、i18n 键名约定）在实现时确定。
- **物品三种名字与三种描述**：同一物品在配置中提供 **name_0 / name_1 / name_2**（三种名字）与 **desc_0 / desc_1 / desc_2**（三种描述）；UI 与系统根据当前档位显示对应名字与描述。档位由**开放技能判断接口**决定。
- **开放技能判断接口**：实现须提供接口（如 `getItemDisplayTier(itemId, character)` 或等价），根据**当前玩家**在物品配置中 `display_skill_id` 所指技能上的**等级**，返回档位 0 / 1 / 2，进而决定使用 name_0/1/2 与 desc_0/1/2 的哪一档。档位阈值从**配置表**读取（如全局常数表字段 `item_display_tier_threshold_1`、`item_display_tier_threshold_2`）；**当前实现可留空**，只要后续配置其他物品时能通过该字段调参即可，未配置时由实现约定默认值。UI 与任何需要展示物品名称、描述的地方均**必须**通过该接口取得档位后再取对应文案，不得写死单档。
- **技能等级存储**：角色技能等级建议存于 `character.skills`，结构为 `{ [skill_id]: { level: number } }`（或等价 `character.skill_levels: { [skill_id]: number }`）；未习得技能时等级视为 0。展示档位接口通过 `character.skills[display_skill_id].level`（或等价）读取等级。语言技能 ID 为 `survival_language`（见 11 技能系统）。
- **技能等级 → 后天属性**：`data/survival-config.json` 中 `skill_attr_gain`：`{ [skill_id]: { [attr_id]: { threshold, value } } }`。`recalcCharacterStats` 默认从 `CharacterAttributes` 已加载的配置读取；也可在调用时传入 `skillAttrGainTable` 覆盖。结算规则：`level >= threshold` 时该项后天 += `value * floor(level / threshold)`（与 `character-attributes.js` 的 `sumFromSkills` 一致）。当前「基本拳脚」为每 20 级 +1 后天筋骨（见 `11-skills`）。
- **战斗后遗症（构式）**：`/data/post-effects.json` 定义 `post_effect_id`、文案 key、`effect_type`（如 **`initiative_always_first`**、**`dispel_one_beneficial_buff_on_target`**）、`valid_skill_ids` / `valid_move_ids`、`effect_params`（如驱散是否在招架 0 伤后仍触发）。招式在 `combat-skills.json` 的 `moves[]` 内可含 **`post_effect_unlocks`**（`min_proficiency_ratio` + `post_effect_id`）与（历史字段）`post_effect_slot_max`。当前实现存档采用**肢体级装配**：`combat.post_effect_sequences[limbId] = post_effect_id | null`；旧档 `post_effect_sequences[limbId][skillId][slot]` 读取时做兼容迁移。**装配校验**：同一 `post_effect_id` 在同一肢体内**至多出现一次**（四肢可各一次）。**`initiative_always_first` 参与交换顺序**时，以 **`resolvePlayerInitiatedExchange`** 为准：先取整速度结构，再读**本击已确定的出招肢体**装配（地图普攻敌先还击时须在二次选肢后调用）。**驱散类**须在 **命中 roll 成功** 且（若配置）**招架后**仍执行的节点调用 BuffSystem，候选池见 `18`。
- **已获得后遗症（后台-only）**：`CharacterAttributes` 状态含 **`post_effects_obtained: string[]`**（去重 id）。**不向玩家默认状态栏/角色面板展示**；仅供 **`getPostEffectsObtainedCount()`**、**`getPostEffectsObtainedIds()`**、**`hasPostEffectObtained(post_effect_id)`** 及 **`syncPostEffectsObtainedFromSkillsState()`**（可手动调用）供剧情、NPC 条件、成就等判断。前三个查询接口在读取前会内部 **`syncPostEffectsObtainedFromSkillsState()`**（按 `skills[*].move_usage` 与 `post_effect_unlocks` 合并熟练度解锁）。剧情直发奖用 **`registerPostEffectObtained(id)`**。随角色存档读写。
- **变式（招式槽被动）**：建议单表 **`/data/move-variants.json`** 定义（与后续 UI/数据导出对齐）。装配位置与招式槽同层，但语义是**被动**：作用于其所在肢体的主动招式结算上下文。
  - **数据字段建议（关键项）**：
    - `variant_id`、文案 key；
    - `source_skill_id`（变式来源技能，可为呼吸法/步法/招架/徒手/兵器等任意技能类型）；
    - `min_source_level`（来源技能等级门槛，来源不满足则变式不可用）；
    - `scale_params_by_source_level`（效果参数按 `source_skill_id` 的**实际等级**线性缩放的声明/口径；变式本身无熟练度）；
    - `assist_scope`（`active_moves` / `parry` / `both`，声明作用对象）；
    - `trigger`（触发条件配置：要求触发/判定口径与 Buff 对齐，使用同一套事件上下文字段与条件判定接口；事件上下文应能对应到某个主动招式的 sub-hit 结算时刻，保持字段如 `hit_roll_success`、`damage_final`、`subhit_index`/`is_last_subhit`、`tags` 等语义一致）。**缺省语义**：未声明时视为恒 true。
    - `target_filters`（作用目标过滤：例如 `valid_move_ids`、动作标签过滤、伤害类型过滤、以及对多段的段序号/段类型过滤；其中段过滤基于事件上下文的 `subhit_index`、`is_last_subhit` 等字段）。**缺省语义**：未声明时不做目标限制。
    - `variant_effect_type` / `variant_effect_params`（把效果赋予“某个主动招式/某个 sub-hit”的结算上下文；如效果是数值乘区/伤害类型改写/叠加附加效果等，均写入此处）。**注意**：该 effect 目录独立于 Buff 的 `effect_type` 目录。
  - **强制约束**：
    - 变式不参与出招指针轮转；变式不产生“出手一次”，不对 `skills[skill_id].move_usage` 计数。
    - 后遗症系统不以变式为目标：变式不可挂 `post_effect_slot_max`，后遗症装配校验不应把变式 id 当作合法 `valid_move_ids` 目标。
    - 变式“只有条件满足才赋予效果”：触发与条件不满足时，对该 sub-hit 的结算不生效；当 `trigger` 与 `target_filters` 都未声明时，等价于默认总是为可辅助主动招式赋予效果。
    - 多段命中时，变式触发条件按 sub-hit **逐段检查**（不允许“整次 cast 只判一次”）。
    - 同一肢体内同一 `variant_id` 唯一；不同 `variant_id` 互不覆盖，按可叠加语义进入执行器合成。
    - 对“参与肢上普攻链”的肢体，招式槽保存/编辑/载入校验时必须满足：至少存在 1 个 `slot_kind="move"`。纯 `variant` 槽配置判为非法并**拒绝保存/拒绝载入**。
    - 当来源技能等级不足（低于 `min_source_level`）时，必须**强制清空该肢体对应变式槽**（含主动链变式槽与招架变式槽）。
    - 变式 effect 允许改写全部已开放战斗结算维度（含命中/招架/伤害链与熟练度增减结算字段）；具体冲突合成顺序由独立 variant 执行器定义。
    - 若技能本体不参与肢上普攻链（如呼吸法/步法/招架）但可作为变式来源，其熟练度统计按该技能既有规则，不因变式额外增加 `move_usage`。
- **战斗技能等级上限（开放接口）**：与 `skills` 一并持久化 `skill_max_level_bonus: { [combat_skill_id]: number }`（整数，可负），含义见 `11-skills`「技能有效等级上限」。凡判断「能否升到 L+1」、传授上限、改级、载入后校验，须使用 `CombatSkills.getProgressionSkillMaxLevel(characterLike, skillId)`（或等价实现），其中 `characterLike` 至少包含 `skills` 与 `skill_max_level_bonus`；**不得**仅以字面 `1000` 作为唯一上界。**数值曲线**（潜能、`Base(L)`、招架比例等）以 `getTemplateMaxLevel` 封顶，参与计算的等级用 `getSkillLevelForStatCurves`（超额级如 1001 与模板满级数值相同）。NPC 触发器可通过效果 `modifySkillMaxLevelBonus`（`skillId`、`delta`）改可练上限；改后若当前等级超过新的 progression 上限，须夹紧等级。
- **肢上招式槽与分槽成数（共用槽）**：每条装备主动战斗技能的肢体，在存档中持久化 **循环槽列表**。同一槽位二选一：主动招式或变式。实现可用统一数组表示（例如字符串 token 或对象 union）；约束是“同槽不可同时有 `move` 与 `variant`”。主动招式槽使用 `power_level`（1～12，与招式模板 min/max 夹紧）；变式槽不使用 `power_level`。轮转时仅在可释放的主动招式槽之间前进，本击 **\(k\)** 取当前主动招式槽 `power_level`。  
- **招架变式槽（新）**：每条肢体的招架技能侧单独持久化 `parry_variant_slots`（建议结构：`{ slot_index, variant_id? }[]`），最多 5 槽；按招架技能等级每 200 级解锁 1 槽。装配校验要求 `assist_scope` 含 `parry`。
- **物品与装备实例**：存档中**装备槽位**与**物品栏每格**存的是**实例**而非仅模板 ID。推荐格式：每格/每槽为 `{ item_id, enchants?: string[] }`，装备槽位必含 `item_id`，若有词条则 `enchants` 为词条 ID 数组；可堆叠且无词条的消耗品/材料可为 `{ item_id, count }`（无 enchants 或空数组）。同一模板的不同实例通过是否带词条、词条列表区分。脱下背心/背包/衣服时，该容器内物品按 05 迁移后，**对应容器置空**，格数随当前装备变化，未装备时该容器为空。
- **快捷腰带格序**：快捷腰带格位与容器格的对应顺序为**先口袋、后背心**（即索引 0～pocket_slots-1 为口袋，pocket_slots～pocket_slots+vest_slots-1 为背心）。
- **防具减伤与词条**：头部/衣服防具的减伤与词条 `armor_bonus` 的叠加为**乘算**：例如基础减伤比例 \(r_{\text{base}}\)、词条加成比例 \(r_{\text{enc}}\)，最终减伤后剩余伤害比例 = \((1 - r_{\text{base}}) \times (1 - r_{\text{enc}})\)（具体公式以 08 为准）。**词条叠加**：同一装备上多个词条之间**相加**（同类型效果数值相加）；**单词条有上限**，上限在词条配置或全局常数中定义。**词条展示**：词条名称与描述**不受**三档名字/描述技能判断影响，使用词条表内单一 `name` 即可。
- **新手套装**：新游戏初始装备写入配置 `default_equipment`（见 `/data/default_equipment.json`）；**仅在新游戏初始化时**根据该表写入 `character.equipment`。**死亡后**全部装备消失，实现时**不得**在死亡/复活流程中再次读取 `default_equipment` 发放装备，复活后装备栏为空。
- **物品表结构（一大表多小表）**：**可以**采用一大表下多小表的结构。**getItemTemplate(item_id)** 建议**先查 equipment、再查 items/consumables 等**；若两表均无该 id，返回 null 或由实现约定（如打日志、视为无效），调用方须处理无模板情况。两种方式均需保证通过 `item_id` 能唯一解析到模板，且装备与消耗品 ID 不冲突。
- **消耗品与材料**：**无词条**，仅有**品质**；**同品质可堆叠**。**品质为单一字段**，不做三档名字/描述展示。物品栏格内格式为 `{ item_id, count, quality? }` 或等价，不包含 enchants。
- **品质六档（与 02 一致）**：全游戏**品质统一**采用「二、区域结构」2.1 的**六档**：**粗糙 → 普通 → 精良 → 稀有 → 史诗 → 传说**（对应颜色：灰 → 白 → 绿 → 蓝 → 紫 → 橙）。消耗品、材料、**装备**的品质均与此六档一致；实现时可用枚举或数字 0～5 对应上述六档，配置与代码内统一引用。
- **脱下背心/背包后容器**：迁移完成后 **inventory_vest / inventory_backpack 置为 []**；快捷腰带格数 = 当前 pocket_slots + vest_slots（无衣服/无背心时对应为 0）。
- **新游戏初始物品栏**：**一律为空**（inventory_pocket、inventory_vest、inventory_backpack、inventory_vehicle 均为 []），仅通过 default_equipment 穿戴初始装备。
- **技能未习得**：未习得技能在角色数据中存为 **level: 0**（如 `character.skills[skill_id].level === 0`）；展示档位接口在技能不存在或 level 为 0 时按**档位 0** 处理。
- **装备穿戴校验**：穿戴时**须校验**该物品模板的 `equip_slot` 与当前槽位一致（禁止衣服穿到 head 等）；装备实例的 **enchants 数量不得超过** 该模板的 **enchant_slots**（如 6）。
- **装备品质**：装备与消耗品/材料一样具备**品质**，与 02 六档一致（粗糙→普通→精良→稀有→史诗→传说）；在装备模板与实例中均有 **quality_tier**（或等价字段），与物品品质枚举共用；同品质装备可依设计决定是否参与堆叠或仅作展示与数值用。
- **载具存储**：拖拽态下需存**载具模板 ID 或实例 ID**（或载具类型 ID + 实例标识）；载具内物品每格格式与口袋/背心/背包一致（`{ item_id, count?, enchants? }`）。此约定作为实现标准。
- **词条上限**：**单个词条的效果上限**（即每条词条单颗效果不超过其 cap），在词条表内为每条词条单独配置上限字段（如 `cap` 或 `max_value`）；实现时应用该词条效果时夹紧至该上限。

### 存档系统（与交易系统强关联，此处集中约定）

- **定位与存放**：存档**仅存于本地**，无服务器端；与「三、死亡惩罚与装备快照」中的**保险代码**是两套东西——保险代码只含装备快照与地牢标识，用于死亡后取回装备；存档是完整游戏进度。存档为**覆盖式**，**不保留历史存档**，仅保留当前一份（实时存档与存档码均为对当前状态的覆盖写入）。
- **实时存档**：游戏采用**实时存档**。当前进度在游玩过程中持续写入本地（如浏览器本地存储，实现时定）；同一设备上再次打开游戏时，直接读取本地进度继续游玩，**无需账号密码**。
- **玩家选择存档**：玩家执行「存档」时，**仅**将**当前所有进度**用 **AES-256 加密**为**密文**（存档码）并交给玩家（复制、导出等）。不产生与实时存档不同的另一套数据，只是把同一份当前进度导出为密文；用于换设备、备份、以及后续与「玩家间交易」等需要跨存档识别的场景。载入时玩家粘贴/导入密文并输入该存档设定时的**账号与密码**，系统比对通过后解密并载入。
- **存档世代**：存档码（玩家选择存档导出的密文）的 payload 内**包含存档世代参数**（如 `saveGeneration`，实现时定字段名）。载入时：若**本地存在实时存档**，则当密文中的存档世代**早于**当前本地实时存档的世代时，**不允许载入**（不允许载入比当前存档更早的存档）；世代相等或更新则允许。若**本地不存在实时存档**（如清缓存/首次打开/换浏览器），则允许载入任意世代的存档码作为初始化。生成交易码时会自动重新生成一份存档码，此时本地存档世代递增或更新，以保证交出物品后的进度为“最新一代”。
- **存档码自动更新**：本作为 **JS 实现的 H5 网页游戏**。**每 50 tick** 自动更新一次游戏内部维护的存档码（序列化当前进度 + 加密，并推进存档世代）。**玩家手动导出**存档码时，**再以当前进度做一次**序列化与加密，将得到的密文交给玩家，因此导出的存档码为导出时刻的最新状态。**性能**：若将序列化与 AES 加密放入 **Web Worker** 或 **requestIdleCallback** 异步执行，每 50 tick 的自动更新与手动导出时的“再更新一次”对主线程与帧率影响可控，一般不严重；实现时可按存档体积与目标设备酌情调整 50 tick 间隔或关闭自动更新。
- **存档体积**：存档体积**可以控制**。可通过只序列化必要字段、使用短键名、对加密前 payload 做**压缩**（如 gzip/deflate，解密后解压再解析）等方式控制体积；实现时可根据需要设定背包/地图等数据的上限或精简策略，以兼顾体积与 50 tick 自动更新的性能。
- **密文约定**（玩家导出的存档密文）：
  - 加密前 payload 内**包含版本号**（与存档顶层 `version` 一致）及**存档世代**。
  - 加密后**需校验**（解密后对内容做完整性校验，校验方式实现时定，如摘要）。
  - 给玩家的代码为**纯密文**（如 Base64 编码，不含明文前缀）。
  - 载入密文时**必须**输入当时设定的账号与密码，比对通过后才解密并载入；且须通过存档世代校验（见上）。
- **存档顶层结构（推荐）**：解密后的存档 JSON 建议采用以下顶层 key；具体嵌套由实现定，可增删字段。
  - `version`：存档格式版本号，便于后续兼容与迁移。
  - **存档世代**（如 `saveGeneration`）：用于载入时与当前本地世代比较，禁止载入更早的存档。
  - `account` / `accountHash`：账号或账号校验信息，用于载入时与玩家输入的账号密码比对。
  - `character`：角色数据（先天/后天属性、技能等级、当前体力/底气、肢体状态等）。
  - **物品栏拆分**：物品栏按四类容器拆分存储；**格子挂在各自装备下**（口袋格数随当前装备的衣服、背心格数随当前装备的背心、背包格数随当前装备的背包）；实现时可将 `inventory` 拆为或扩展为：
    - `inventory_pocket`：口袋内物品（列表或按格位；格数由当前装备的衣服配置决定）。
    - `inventory_vest`：背心/弹挂内物品（格数由当前装备的背心配置决定）。
    - `inventory_backpack`：背包内物品（格数由当前装备的背包配置决定）。
    - `inventory_vehicle` 或等效：**拖拽态载具**需单独存储，建议包含 **当前绑定载具的实例 ID（或载具类型 ID + 实例标识）** 以及 **该载具内物品列表**；若载具为世界实体，则场景/地图数据中需能存储“某格上的载具实体及其物品栏”，载入时根据是否处于拖拽态决定载具栏是否并入角色数据展示。
  - `equipment`：当前装备，按槽位存储**装备实例**（每槽 `{ item_id, enchants?: string[], quality_tier? }` 或 null）；**空槽一律写 null**，不省略键，便于遍历与读档一致。
  - 其他：如地图进度、任务状态、生产建筑、仓库等，按需扩展。
- **与交易系统的关联**：玩家间交易依赖**特征码**标识交易双方；交易码解密后含双方特征码与交易物品信息。生成交易码时会**自动重新生成存档码**并更新**存档世代**，避免通过载入旧存档取回已交出的物品。详见「九（附）、玩家间交易系统」。

---
