# 四十七、制药系统（设计定稿）

> **状态**：R1–R5 已收敛；**R2 途径剂型修订**：注射从「并行第四条途径」改为「下游再加工」——由已做好的药粉/药片 + 溶媒配成注射液，支持多种药物联合。**R6 配伍危险**（化学相冲）与 **R7 配药模型**（原料四类 + 药效/毒性配比 + 浓度上限）已定稿。数值占位标 `❓`，实现前需调定；实现缺口见 §1.1。
> **落地状态（2026-09）**：设计已全量实现并接入运行时与 UI —— 框架六缺口、剂型矩阵、成分 roster、配药模式 + 动态注射液、成瘾/毒性、针具卫生、首版药品全表（24 件成品 / 46 条配方）、信息显示（字段规则 + `module.pharmacy_medicine`）。实现细节与偏差记于 §1.1，已收口/仍待定项见 §8，药品全表见 §6.5。
> **关联**：`22` 统一配方系统（实现口径）、`11-skills.md`（`life_pharmacy`/免疫/代谢）、`06` 生存属性、`18` Buff、`09` 身体部位、`19` 动作系统、`27` 物品模板字段、`43` 食物消化、`41` 品质移除、`看板 k142` 异常状态、`34` 肌肉系统（经脉废弃）、`45` 电池经济、`16` NPC 任务模板。
> **实现口径锚点**：`data/recipe-methods.json`、`data/recipes.json`、`data/life-skill-recipe-interfaces.json`、`js/recipe-system.js`、`js/recipe-schema.js`、`js/scene-app.js`（`tryPharmacyAtStation` / `tryCompoundAtStation`）、`js/pharmacy-station.js`、`js/pharmacy-config.js`、`js/pharmacy-compounding.js`、`js/pharmacy-effects.js`、`data/pharmacy-system-config.csv`、`data/pharmacy-buff-matrix.json`、`data/pharmacy-recipes.json`、`data/pharmacy-conflict-rules.json`、`data/items/*.csv`、`tools/smoke-pharmacy.mjs`。

---

## 0. 范围与原则

- 药效覆盖四域：**生存/状态恢复、战斗增益/临时能力、药物负担与副作用、探索与生产辅助**。
- **无必备物品**（药品为可选增强）、**0 教学 0 引导**、**高风险高惩罚**。
- 制药技能 `life_pharmacy`；生活系熟练度乘法系数口径（`11-skills`）。
- **文案与数据口径（2026-09 裁决）**：本系统是虚构游戏机制，所有数值为平衡量纲；**不描述、不暗示任何现实物质的制备方法或配比**。

---

## 1. 现状盘点（前提事实 · 现状盘点日期：2026-09；以当时磁盘为准）

> **注**：本节是**设计期**的磁盘快照（当时 `recipes.json` 制药配方为零、4 件 `potion_*` 为死占位）。落地后的现状以 §1.1 为准，本节保留作为设计起点记录。

- 制药骨架已占位：`recipe-methods.json` 有 7 个 `life_pharmacy` 方法（`crushing`/`maceration`/`distillation`/`filtration`/`centrifugation`/`crystallization`/`tableting`，带 `station_pharmacy` 门禁、配件 `tool_*_pharmacy`、默认失败 `item.scrap.herb_dregs`）；`life-skill-recipe-interfaces.json` 有接口行（默认 crushing）；`recipes.json` 配方为零。**占位值不作数值依据。**
- 制药台 NPC 站初始**破损**，修复链 = `ore_clay_raw` + `wood_firewood` + `tool_rolling_pin_pharmacy` 各扣 1。
- 无现成药水：4 件 `potion_*` 死占位**确认删除**，药水物品从零设计；异常状态（中毒/流血/灼烧）未实装 → 首版**只治已存在的病**；经脉/穴位废弃（`34` 肌肉系统取代）→ 刺入给药不挂武学针法；`herb_*` 带语义标签（alchemy/medical/stimulant/`surface_only` 等）。

### 1.1 实施缺口清单（并入 §8 与看板跟踪）

> (实施缺口并入 §8 待定项与看板跟踪,不在设计正本重复维护)

**当前实现状态（2026-09 补记，与看板同步）**

| 缺口 | 状态 | 落点 |
|---|---|---|
| ① 制药无熟练度接线 | 已实现 | `js/pharmacy-station.js`（镜像烹饪：500 万次满级 100 / 每级 +0.5% 成功率 / 满级必成，计数键 `pharmacy_success`） |
| ② 无 `pharmacy-system-config.csv` | 已实现 | `data/pharmacy-system-config.csv` + `js/pharmacy-config.js`（CSV → 归一化配置，scene-app 注入 `PharmacyStation.setConfig` / `PharmacyEffects.setConfig`） |
| ③ 失败物 id 悬空 | 已实现 | 统一 `item.scrap.herb_dregs`（药渣，`data/items/materials_all.csv`）；`food_pharmacy_fail_generic` 已废弃 |
| ④ `pharmacy_ingredient` 全库 0 | 已实现 | `tools/mark-pharmacy-ingredients.mjs`（alchemy 标签 + 显式清单）+ `data/items/pharmacy_base.csv`（成分/溶媒/器具/成品） |
| ⑤ 消费判定三选一需为药水开口 | 已实现 | `tools/build-items-json.mjs` 补 `usable`/`use_buff_id`/`use_action` 落值（原先被丢弃）；`js/item-use.js` 四途径分流 + 背包面板外敷选部位 |
| ⑥ 堆叠口径 | 已实现 | build 按 CSV 落 `stack_limit`（不再强制 1）；运行时 `getMaxStack` 读 `stack_limit`（`stack_max` 兼容） |

**实现期补充口径（与设计正本的差异，均已落地）**

- **生效时间**：`onsetTicks` 进 `js/buff-system.js`（`normalizeTemplate` + 结算/被动查询统一门闸），口服 5 / 外敷 3 / 吸入 2 / 注射 0。
- **剂型矩阵生成**：`data/pharmacy-buff-matrix.json`（family × route × potency 源表）→ `tools/build-pharmacy-buffs.mjs` 生成 `buff_pharm_<family>_<route>_<potency>` 及副作用/相冲/成瘾阶段模板写入 `data/buffs.json`（幂等，带 `pharmacy_generated` 标记）。
- **相冲结算位置修订**：§10.2 原设想用「每条药效 buff + `apply_buff_if_has_buffs` 判 `judgment_tags.chem_class`」，但剂型 buff 是**族级**（同族多成分共用一条），拿不到逐成分化学成分。改为**注射时按 `data/pharmacy-conflict-rules.json` 做类别级两两比对 + 溶媒错配规则**，命中即授予 `buff_pharm_conflict_*`——仍是「一针下去才结算」，且数据表可改。
- **成瘾/毒性运行时**：`js/pharmacy-effects.js`（状态落 `SceneCtx.pharmacy_effects`，save-system 显式快照）；阶段惩罚用 `CharacterAttributes.setExternalAcquiredMultiplier` 乘在后天五维实际值上；压制判定读 buff 的 `pharmacy_route`/`pharmacy_potency`，`BuffSystem.setBuffStateListener` 保证断药即时显形。
- **配药模式**：`js/pharmacy-compounding.js`（浓度预算 / 按族净药效→potency / 净毒性抵消封顶 / 成盐判定→沉淀注射液 / 相冲 / 动态实例 `components`）；制药台面板「制作 · 配药」双模式 + 浓度条 + 成盐行 + 配药图鉴。
- **存档**：`js/save-system.js` 补制药站点运行时、`known_recipe_ids_by_system.life_pharmacy` 图鉴、`SceneCtx.pharmacy_effects`（原先只存烹饪）。
- **UI 信息显示**：`data/item-field-display-rules.json`（常驻 `pharmacy_common` 块 + 制药块字段 + 4 个新渲染器）、`data/item-info-modules.json`（`module.pharmacy_medicine`）、`js/scene-ui.js` buffLookup 补剂型字段。
- **❓数值张力（k246 待调）**：自然衰减 1/tick + 重档门槛 56 + 致死倒计时 40 tick ⇒ 需初始体内毒性 ≥96 才可能致死（56~95 区间永不致死）。首版按当前配置接线，平衡待调。
- **未接线（有模板无消费者）**：`pharmacy_bleeding_slow`（等 k142 异常状态）、`pharmacy_part_recovery`（等 09 部位恢复结算）、`pharmacy_revive`（等昏迷/濒死拉回链）；`pharmacy_synergy_multiplier` 由配药结算自行计算，模板内效果无消费者。

---

## 2. 制程模型（R1）

### 2.1 多级配方链
- **前处理配方**：生药材 → **中间品物品**（真实、可堆叠/可存/可交易/可作输入）。
- **终制配方**：中间品（+辅料）→ 剂型成品。
- 中间品**可直接粗用**（药粉冲服/撒敷、浸出液口服/外洗、药泥外敷）；丸锭/药膏/药烟需成型配方。
- **注射是下游再加工，不是并行的第四条链**：以已做好的**药粉/药片**（固体制剂）为原料，加**溶媒**「配药」→ **注射液**；可**多种药物联合**配进同一瓶（见 §3/§4/§5）。**配药只在制药台完成**，产出预制好的注射液成品物品进背包，不在使用现场临时配。
- 复用统一配方路由（inputs 超集匹配）。固定剂型配方零运行时扩展；「联合配药」的动态合成见 §9。

### 2.2 失败与损耗
- 方法默认失败产物 = 药渣（id 待定，§1.1）；**配方级 `failure_output` 覆盖**（recipe > method 已支持）。
- 失败不损毁主料；失败产物即损耗（去向待定，可回收/堆肥/丢弃）。

### 2.3 技术层级
- 低层（制药台即可）：捣碎、浸取、过滤、压片。
- 高层（需解锁）：蒸馏、离心、结晶 → 电池电力/配件/图纸/技能门（对齐 `45`）。

---

## 3. 给药途径与剂型模型（R2）

### 3.1 完整链路

```
生药材 ─单元操作(method)→ 中间品载体(可粗用) ─成型配方→ 剂型成品(口服/外敷/吸入) ─use_action 按途径结算→ 药效入体
　　　　　　　　　　　　　　　　　　　　　└─ 药粉/药片(固体制剂) ─配药(+溶媒, 可联合)→ 注射液 ─inject 滴注→ 药效入体
```

### 3.2 四条途径

| 途径 | 剂型方向 | 起效/形态 | 作用域 | 负担档 |
|---|---|---|---|---|
| 口服 | 汤液/散剂/丸锭 | 慢-中/平稳持久（可走 43 消化） | 全身系统 | 消化负担 |
| 外敷 | 药泥(粗)/药散/药膏/膏贴 | 中-缓/局部持续 | 部位（唯一能治部位伤） | ≈0 |
| 吸入 | 药烟/蒸汽熏蒸 | 快/爆发短促 | 全身快速+呼吸道/催醒 | 高血药 |
| 刺入 | 注射液（由药粉/药片+溶媒再加工；可联合用药） | 最快 | 全身直达/急救吊命 | 最高+针具卫生 |

- **负担按途径差分**；成瘾累积同轴（§4）。
- 刺入与其他三条途径**不同源**：口服/外敷/吸入从生药材直达；刺入从**已做好的药粉/药片**起步（见 §2.1），属下游再加工。

### 3.3 剂型契约
- 剂型 = **独立成品物品**（同药效可多剂型）。
- 档位字段仅两项：`起效×药效形态`、`作用域/部位`。负担/场合对象/保存器具**不入档位字段**。
- **药效核心 = buff 模板族**：剂型物品引用核心 + 携带档位；不重复造效果。
- 药效-剂型适配 = **全开放 + 文档自律**（不设 schema 白名单）。
- **注射液**：由药粉/药片配成，药效 = 参与配药各成分药效之**并集**（联合用药）；按药效族各挂一条 buff，族内净药效合成单档、跨族并集。**注射液是制药台预制的普通成品物品**，进背包；inject 动作直接滴注，使用时不临时配。
- **浓度上限**：注射液有总浓度容量——一袋溶媒能溶解的总药量有限。每种药粉/药片占一个**浓度占用**值（不同药占用不同）；联合配药时各药浓度占用之和 ≤ 上限，自由组合，但不能配太浓（完整模型见 §9）。
- 效力档 `potency` 见 §4.3。

### 3.4 剂型 = 不同 buff 模板（生效时间 / 持续 / 形态）❓数值占位

| 剂型 | 生效时间 | 持续时间 | 生效形态 | 作用域 | 峰值强度 | 负担 |
|---|---|---|---|---|---|---|
| 注射 inject | 0 tick（立即） | 短 5–15 | 即时爆发·峰值最高 | 全身直达 | 1.0 | 最高+针具卫生 |
| 吸入 inhale | 1–2 | 中 10–25 | 爆发短促 | 全身+呼吸道 | 0.9 | 高血药 |
| 口服 drink | 3–8 | 长 30–120 | 平稳持久（走 43 消化） | 全身 | 0.8 | 消化负担 |
| 外敷 topical | 2–5 | 长 30–180 | 缓释局部 | 部位（唯一治部位伤） | 0.7 | ≈0 |

- **剂型 = 不同的 buff 模板** `buff_<药效族>_<剂型>`：每个模板自带 onset/duration/生效形态/作用域/峰值强度，不是「同一个 buff 打个折」。同一药效族不同剂型 = 形状完全不同的 buff（例：镇痛·注射 = 立即压全档；镇痛·口服 = 慢起效平稳长；活络·外敷 = 只治敷的部位、失能恢复）。
- 生效时间 = 使用后到 buff 开始生效的 tick 数；持续时间 = buff 的 `durationTicks`。二者由**剂型**定。
- potency 档（weak/regular/potent，§9.2）是每个剂型 buff 内的强度分档；剂型「生物利用度」已烙进各模板峰值强度（上表），不做运行时倍率。
- 三个正交维度：**药**（药效族）定「什么效果」；**剂型**（buff 模板）定「多快起效、持续多久、全身还是局部、峰值多高」；**配药**（剂量 → 净药效/净毒性）定「下多重的手、落到哪个 potency 档」。

---

## 4. 药物负担与成瘾度（R3）

> "维持剂量"式生理依赖：一条可见条 + 四阶段 + 效力档压制（耐受→需更强药 / 戒断→属性惩罚 / 渴求→惩罚逼续药）。

### 4.1 上瘾值（可见条）
- **全局单条** `addiction` 0–100，属性栏像生存属性可见（`Survival.state` + `survival-config.json` 同构）。
- 累积：任何致瘾用药按 `途径增量 ×（1−免疫减免）` 涨值。增量（2026-09 定稿）：外敷 0 / 口服 3 / 吸入 8 / 刺入 12。
- **联合注射液**：一瓶含多种致瘾药时，各成分按各自途径增量**累加**（联合更高效、也更快上瘾）。
- 衰减：自然回落 0.02/tick（≈0.4/分钟）；免疫等级加速（满级 ×2.5）。

### 4.2 四阶段与惩罚
- 阈值：**<25 阶段一；25–50 阶段二；50–75 阶段三；≥75 阶段四**。
- 阶段一无异常；阶段二~四降低基本属性：按实际值乘 **−10% / −20% / −35%**。
  - 范围：后天五维（筋骨/柔韧/呼吸/身手/专注）实际表现；读取五维的公式自然连带。**不动上限条、不做单独恢复折扣；心情不并入。**
- 惩罚形态：状态 debuff（如「药瘾·三阶段」）；满足压制条件时暂时取消。

### 4.3 效力档 potency
- 药效 buff 模板声明 `potency: weak | regular | potent`。同一药效家族可有多个档位 buff 模板，剂型引用其一。
- 文档自律：效力档与配方成本挂钩（强效 = 更纯中间品/更高阶工艺/更稀素材）。

### 4.4 压制规则（泛药物交叉压制）
- 阶段二~四监听身上**入体途径**（口服/吸入/刺入）产生的药物 buff：≥ 门槛档 potency → 惩罚暂时取消。
  - 阶段二需 ≥ weak；阶段三需 ≥ regular；阶段四需 ≥ potent。
- **交叉压制**：任何够档的入体药 buff 都能压（A 药瘾可用 B 药强效压；B 自己也涨瘾）。
- **外敷药既不涨瘾也不参与压制**。
- 断药/只剩低档 → 惩罚显形。

### 4.5 「免疫」接线（五向全做，2026-09 补完）
- 免疫等级 → ①累积增量减免 ②自然衰减加速 ③惩罚强度缩小 ④**延长药效持续时间**（`pharmacy_duration_immunity_bonus_per_level`，封顶 ×3）⑤**减轻副作用强度**（`pharmacy_immunity_sideeffect_reduction`，封顶减免 80%）。
- `11-skills`「延长止痛药持续时间」→ 止痛 buff 时长变长 = 压制窗口变长（已由 ④ 覆盖）。

### 4.6 世界观
- `30-story-outline-blackout` 毒枭断药控人情节 = 玩家侧成瘾的镜像背书。

---

## 5. 使用语义（R4）

### 5.1 use_action 分流
- 物品模板新增 `use_action: drink|topical|inhale|inject` + `use_buff_id`（引用药效核心）；扩展 `itemTemplateIsConsumable`/`applyItemUseEffectFromTemplate` 分流结算（`consumables_base.csv` 补列）。成功仍 `advanceTick`。
- **已实现（2026-09）**：`tools/build-items-json.mjs` 落 `usable`/`use_buff_id`/`use_action`（此前被静默丢弃）；`js/item-use.js` 按途径分流——外敷需 `part_id`（七部位）、吸入无门槛（免火源）、刺入需器具 + 卫生结算 + 动态注射液按实例成分结算；`drink` 带 `use_effect` + `food_buff_duration_ticks` 时走 43 消化曲线；失败原因经 `takeLastUseFailure()` 映射到文案。

### 5.2 各途径使用
| use_action | 动作 | 战斗内/外 |
|---|---|---|
| drink | 喝下；耗时 1 tick | 战斗中可用（占行动，对齐战斗中进食先例） |
| topical | **手动选部位**（七部位 UI）后敷上；耗时 1 tick | 战斗中不可 |
| inhale | 直接吸（**不需火源**，2026-09 裁决）；耗时 2 tick | 战斗中可用；烟气=位置暴露（待定） |
| inject | 器具（注射器/输液器）+ 静止 | 战斗中不可；急救/重症；联合注射液一次滴注释放多成分药效 |

- 门禁已实现（2026-09）：**外敷/注射战斗中不可**（地图内 ≤2 格有存活敌人即视为交战）、**注射需静止**（不在挂机采集/调息/制作中）；口服/吸入不受战斗门禁。

- 外敷部位表达：buff owner 级无部位参数 → 外敷作"作用于指定部位"结算（操作 09 部位状态；手脚失能恢复加速需接线），或带 part 参数的 buff；选择后消耗 1 并作用所选部位。一盒多次用量（按次）→ §8。
- 战斗内/外与占行动条目需与 `19` 动作系统对齐登记。

### 5.3 给药对象
- **永久仅自己**（2026-09 裁决）：不做任何给 NPC/同伴用药的通道——包括剧情/事件脚本；`16` 任务模板不得为他人开药、不得对他人结算药效。
- 七部位无"背"，全部自可达，无够不着问题。

---

## 6. 配方目录骨架与示例（R2c）

### 6.1 骨架
- 配方 = 统一表条目（`recipe_system: life_pharmacy` + `method_id` + `inputs[]` + `main_output` + 可选 `failure_output` 覆盖/`unlock`）。
- 链 = 前处理配方（→中间品）→ 终制配方（→剂型成品）；中间品可被多配方共用。
- 素材来源：采集药草 `herb_*`（低层）/ 狩猎血骨（中层）/ 地牢素材（高层，`region_restrict`）。
- 效力档与配方成本挂钩（§4.3 自律）；首批只做"已存在的病"可治的药效（§1）。

### 6.2 示例 A：提神核心（口服/吸入/注射三剂型）❓数值占位
```
核心 buff 族：buff_tonic_stimulant
  weak   : potency weak,  survival_delta {energy:+X/tick}, duration ❓   ← 汤液引用
  regular: potency regular, survival_delta {energy:+Y/tick, fatigue:-Z}, duration ❓ ← 药烟引用
中间品：med_vine_powder 赤藤药粉
  配方：herb_vine_red(赤花藤)×1 + [method crushing] → 药粉×N（可粗用：冲服 = weak 汤液效果）
成型：药粉 + 水 → [maceration] → 提神汤液（use_action drink, use_buff_id=buff_tonic_stimulant.weak）
      药粉 + 烟纸/管 → [tableting?/卷制 ❓] → 提神烟（use_action inhale, use_buff_id=buff_tonic_stimulant.regular）
配药：药粉 + 溶媒 → [溶解/灭菌 ❓] → 提神注射液（use_action inject, use_buff_id=buff_tonic_stimulant.weak）
联合：提神药粉 + 镇痛药粉 + 溶媒 → 复方注射液（多 buff 并集，见 §3.3/§4.1）
风险：口服少量涨瘾；药烟涨瘾多；注射涨瘾最多，联合再累加（§4.1 途径增量）；文案常驻"不宜连服，久服或致依赖"
```

### 6.3 示例 B：外敷·活络（部位）❓
```
核心：buff_mobility_restore（topical；手动选部位；效果=加速手脚失能恢复/缓淤，接 09 部位恢复接线）
链：药草(如 herb_root_bitter 系) → [crushing] → 药粉 → +油脂基质 → [调和 ❓成型方法] → 活络药膏
外敷不涨瘾不压瘾；战斗中不可；自己手动选部位敷用
```

### 6.4 说明
- 完整首版配方全表（含解锁/成本/失败物/数值）在实现排期时另表写作（本次定骨架+示例）。
- 方法"调和/卷制"若需新 method/配件，列入实现清单（§1.1/§8）。

---

### 6.5 首版药品全表（2026-09 落地，26 件成品 + 56 条配方）

> 数据落点：`data/items/pharmacy_base.csv`（成品剂型）与 `data/pharmacy-recipes.json`（配方）→ `tools/build-pharmacy-recipes.mjs`。
> potency 由输入药粉 `pharm_effect` 之和决定（≤33 weak / 34–66 regular / ≥67 potent），下表为配方实测档位。

**口服（drink，走 43 消化）**：安神汤（THC 45→regular）、提神汤液（赤花藤 35→weak）、浓煎提神汤（赤花藤×2 70→potent）、续航糖浆（葡萄糖 60→regular）、补液汤（补液粉 70→potent）、续力药汤（鹿茸 75→potent）、醒神茶（石菖蒲 60→regular）、幻梦汤（裸盖菇素 55→regular）、镇痛药丸（苦根草 30→weak）。

**外敷（topical，按次用量）**：红花药泥（红花 60→regular，2 次）、活络药膏（苦根草，3 次）、红花活络膏（红花×2 120→potent，4 次）、三七止血散（三七 65→regular，3 次）、白芨止血膏（白芨 70→potent，3 次）。

**吸入（inhale）**：提神药烟（赤花藤）、安神药烟（THC 45→regular）、幻梦烟（裸盖菇素×2 110→potent）。

**刺入（inject）**：提神注射液（麻黄碱 70→potent）、镇痛注射液（吗啡 85→potent）、醒神注射液（石菖蒲 60→regular）、续力注射液（鹿茸 75→potent）、止血注射液（三七 65→regular）、补液注射液（补液粉）、强心注射液（强心粉）、复方注射液（配药台动态实例）。

**新增支撑材料**：红花 `herb_safflower` → 红花粉 `med_safflower_powder`（mobility 60/0/18）；三七 `herb_notoginseng` → 三七粉 `med_notoginseng_powder`（coagulant 65/0/20）。这两个族此前**没有药粉来源**，配药台配不出活络/常规档凝血。

**精制档（2026-09，粗制/精制两档）**：8 种精制药粉（`*_refined`）由四个高层工艺产出——蒸馏（THC/石菖蒲，挥发油）、结晶（吗啡/可卡因，生物碱纯化）、过滤（护肝草/三七）、离心（裸盖菇素/红花）；配方 **2 份粗制 → 1 份精制**。精制档 = 药效 ×1.25 / 毒性 ×0.6 / 浓度占用 ×0.8 / 价值 ×2（更纯 → 更强、更干净、更省浓度预算）。高层工艺解锁门槛：过滤 ≥4 级、蒸馏 ≥6、离心 ≥8、结晶 ≥10。两件精制成品：精制镇痛注射液、精制醒神注射液（后者升到 potent 档）。

---

## 7. 知识与 0 教学（R5）

- **配方获得 = 盲配试药**：盲配（材料+工艺）首次成功 → `markPharmacyRecipeKnown` 写图鉴（链路已接，双写 `known_recipe_ids_by_system[life_pharmacy]`）。配方 `unlock`（`skill_level_min` 等）作硬门槛。
- NPC 传授/配方书为**后续内容通道**（v1 不做）。
- **制药熟练度**：成功制作 +1 usage（同烹饪口径，已实现：500 万次满级 / 每级 +0.5% 成功率 / 满级必成，见 §1.1 ①）。
- **0 教学入口 = 制药台修复链**：初始破损 → 修复（黏土+木柴+擀药杖）→ 面板启用（npc_flag）。
- **信息分级（已实现，2026-09）**：药名 + 功效文案（`fn`）自带，常驻可见；**给药方式 / 按次用量**（`pharmacy_common` 块）与**风险提示**（`module.pharmacy_medicine`：久服致依赖 / 配药会析出沉淀 / 针具不洁带感染）不设技能门；**药效族·途径·档位、起效/持续、毒性、浓度占用、成分身份、注射液成分**等细节需 `life_pharmacy` 1 级才展开（字段规则 `pharmacy` 块），未达等级显示「制药经验不足」+ 差几级。渲染落点见 `27` §8.1.1。
- 药草描述已做风险预告风味（如赤花藤"副作用不小"）。

---

## 8. 待定项（数值与实现排期）

**已收口（2026-09 实现落地，k246）**

- 溶媒物品族与获取渠道：`solvent_saline` / `solvent_glucose_solution` / `solvent_water_pure`（k227）。
- 注射器/输液器：`tool_syringe_pharmacy`（可重复用）/ `tool_iv_set_pharmacy`（一次性）；卫生门槛 = 一次性器具优先消耗 → 否则消耗 1 份消毒剂（`food_wine`）→ 两样都没有则本次额外注入感染毒性（`pharmacy_dirty_injection_toxicity`，k244）。
- 联合注射液「动态合成」：运行时实例 `{item_id: potion_compound_injection, components[]}`（`inventory copyItemInstance` 保留 components）；图鉴/统计落 `SceneCtx.pharmacy_compound_history`（成分组合键 → 族/potency/净毒性/相冲数）。
- 多 buff 叠加/时长结算：**各成分按各自药效族的剂型 buff 独立计时**（同族合成单档、跨族并集）；时长由剂型定（注射 10 / 吸入 18 / 口服 60 / 外敷 90 tick），生效时间 `onsetTicks` 由 buff-system 统一门闸。
- 药渣/失败物 id 与 `pharmacy-system-config.csv`：统一 `item.scrap.herb_dregs` + 建档（§1.1）。
- 中间品与剂型 ID 族 + 首版配方全表：`data/items/pharmacy_base.csv`（52 件）+ `data/pharmacy-recipes.json`（26 条）→ `tools/build-pharmacy-recipes.mjs`。
- 外敷「多次用量」：模板 `use_charges` → 实例 `charges` 递减（活络药膏 3 次），用尽才消失。
- 新 method/配件：`life_pharmacy.blending`（调和，配件药钵 `tool_mortar_pharmacy`）与 `life_pharmacy.rolling`（卷制，配件卷药器 `tool_roller_pharmacy`）。
- 压制门槛与 potency 的 UI 呈现：剂型 buff 名自带「族·途径·档位」；状态栏药瘾行显示阶段与「已压制」，毒性行显示档位与致死倒计时。
- **给药对象永久仅自己**（2026-09 裁决）：`item-use` 只对 `player` 结算，不做任何他人用药通道（含剧情脚本）。
- **吸入免火源**（2026-09 裁决）：`use_action=inhale` 不再校验点火物，配置键 `pharmacy_inhale_igniter_item_ids` 已移除；烟气暴露位置仍待定。
- **维生素C 两形态**（2026-09 裁决）：辅成分粉（抵消·可相冲）与助剂（助溶·不抵消不相冲）各一件，见 §9.1/§9.7。
- **制药水口径**：`solvent_water_pure`（纯净水）= 制药溶媒/配药底液与制药配方用水；`ore_water_pure_soft`（纯净软水）= 烹饪用水（制药配方已不再引用）。
- **成盐判定**（2026-09 定稿，§9.5）：碱型药成分需助剂助溶；不足不阻止配药，产出「沉淀注射液」（药效 ×0.5 / 净毒性 ×1.5）。
- **免疫五向**（2026-09）：除成瘾三向外，追加延长药效时长（封顶 ×3）与减轻副作用强度（封顶 80%）。
- **口服走 43 消化**（2026-09）：`drink` 剂型带 `use_effect` + `food_buff_duration_ticks` 时走消化曲线（按 tick 缓释），不再一次性直加。
- **溶媒错配相冲**（2026-09）：`data/pharmacy-conflict-rules.json` 增 `solvent_rules`（糖水兑矿物盐、盐水盐析酸性成分 → 析出）。
- **战斗/静止门禁**（2026-09）：外敷/注射战斗中不可、注射需静止（§5.2）。
- **配药图鉴**（2026-09）：`SceneCtx.pharmacy_compound_history` 记录成分组合 → 族/potency/净毒性/相冲数，配药面板列出最近组合。
- **药渣去向**（2026-09）：`item.scrap.herb_dregs` 给燃料 10 与 `fert_c/fert_n`（可当柴、可进沤肥）。
- **副作用逐族文案**（2026-09）：副作用模板带 `pharmacy_family_flavor`（12 族），注射后按主药族派生带风味的副作用 buff（如「心悸·轻」）。
- **文案口径**：本系统是虚构游戏机制，所有数值均为平衡量纲；**不描述、不暗示任何现实物质的制备方法或配比**（2026-09 裁决）。
- **相冲表扩展 + 剂量分档**（2026-09）：类别对 5 → **9 条**（新增苷类×鞣质、生物碱×矿物、挥发油×矿物、有机酸×矿物），溶媒规则 3 条（新增「纯水×挥发油」，可被助剂助溶豁免）；规则支持 `outcome_severe` + `severe_concentration` —— **同一对冲突随剂量升级**（如强心苷+钙：剂量 <40 轻症沉淀，≥40 转重症）。功能成分（toxicity=0）**参与**相冲（化学相容性与副作用无关），溶媒/助剂豁免。
- **吸入用耗时区分**（2026-09 裁决）：不做额外动作，按途径扣 tick —— 口服/外敷 1、吸入 2、刺入 3（`pharmacy_use_ticks_*`，`ItemUse.getUseTickCost` → `advanceWorldTicks`）。
- **成瘾 / 免疫 / 致死窗口数值定稿**（2026-09）：途径增量 0/3/8/12（外敷/口服/吸入/刺入）；自然衰减 0.02/tick（≈0.4/分钟）；免疫每级 −0.5% 累积、+1.5% 衰减、−0.5% 惩罚（满级 −50% / ×2.5 / −50%）；体内毒性衰减 1.5/tick、重档倒计时 16 tick ⇒ **致死门槛 ≈80**（79 存活、81 致死、100 在 16 tick 内致死）。
- **制药不接鉴定**（2026-09 裁决）：药品信息门槛只用 `life_pharmacy` 等级，**鉴定留给其他系统**（字段规则里制药字段 100% 走药学门闸）。
- **精制链**（2026-09）：四个高层工艺全部有配方 + 粗制/精制两档药粉（§6.5）。

**仍待定**

- 制药台配件获取渠道（制造/贸易/藏身处升级）——11 个 `tool_*_pharmacy` 目前无产物/贸易渠道（**本项按 2026-09 裁决暂时搁置**）。
- 体温恢复通道（体力/精力/心情已由兴奋/镇静族覆盖；体温无落点）。
- 吸入烟气=位置暴露（火源门槛已按裁决取消，暴露表现未做）。
- 部分自定义效果类型暂无消费者：`pharmacy_revive`（等昏迷/濒死链）、`pharmacy_bleeding_slow`（等 k142 流血）、`pharmacy_part_recovery`（等 09 部位恢复）；`pharmacy_synergy_multiplier` / `pharmacy_addiction_penalty` 由运行时自行计算，模板内效果不消费。
- 制药台配件获取渠道（制造/贸易/藏身处升级）——11 个 `tool_*_pharmacy` 目前无任何产物/贸易渠道。

---

## 9. 配药模型（R7）

> 注射是下游再加工：以已做好的药粉/药片为原料，在制药台「配药」成预制注射液。配药不是纯 buff 向——它是「为了嗨，同时伺候被药搞坏的身体」的配比题；瞎配会死，死法两条：**毒性未中和**（本节的剂量配比）与**化学相冲**（§10）。

### 9.1 配药成分（溶媒 / 成分三型 / 助剂）

| 角色 | 是什么 | 作用 |
|---|---|---|
| 溶媒 | 底液（生理盐水/葡萄糖/纯水） | 兑稀、作浓度上限载体（不占浓度） |
| 成分 | 药粉/药片（下分三型） | 提供效果与/或影响毒性 |
| 助剂 | 酸化/助溶物（维生素 C 类） | 成盐助溶，碱型成分不加兑不开 |

- **成分三型（不是死标签，由数值决定）**：每味药粉/药片带两个数——**药效**（效果强度）与**毒性**（可为 0 或负）：
  - `toxicity > 0` = 药成分（主药）：给效果也带副作用 → 走毒性/成瘾/相冲那套。
  - `toxicity = 0` = 功能成分：纯功能、无副作用、不用配辅药（盐/糖/白芨/石菖蒲/鹿茸/兽心提取等）。
  - `toxicity < 0` = 辅成分：抵消毒性（抵消，非转化）。
- **功能成分与药成分同走一个浓度预算、同一张配药台**：「干净针 vs 毒品针」坍缩为「成分毒性 0 vs >0」。功能成分同走 potency 档（粗制/精制差效果）。
- **同一物质可以有两种形态**（2026-09 裁决，以维生素C 为范例）：
  - **辅成分形态** `med_vitamin_c_powder`（维生素C粉）：`pharm_powder`、toxicity −15、带 `chem_class=organic_acid` → **抵消毒性**，但参与相冲（酸性 + 生物碱 → 沉淀）。
  - **助剂形态** `adj_vitamin_c`（维生素C）：`pharm_adjuvant`、无毒性、无 `chem_class` → **只做成盐助溶**，不抵消、不参与相冲。
  - 玩家自行取舍：「拿它洗毒性」还是「拿它兑开碱型主药」。
- **副作用风味标签**：毒性数值上是标量，但每味药按药效族挂一个副作用风味（镇痛→呼吸抑制/便秘、兴奋→心悸、致幻→谵妄、增效→血压危象），只决定净毒性爆出的 debuff 文案与表现，不做分类型结算。

### 9.2 配比结算

- 净药效按**药效族**结算：每个在场药效族，其成分 `effect` 之和 → potency 档（0–33 weak / 34–66 regular / 67+ potent，封顶 potent）；注射液对每个在场族各挂一条对应档的 buff（同族合成单档、跨族并集）。
- 净毒性 = Σ(主药毒性 × 份数) × (1 − 抵消率)。**净毒性 > 0 = 副作用未中和** → 注射后副作用爆发，按档位结算：
  - ≤0 无副作用；1–25 轻（恶心/便秘/心悸：心情↓、恢复变慢）；26–55 中（呼吸抑制/心律不齐：持续掉体力精力、行动变慢）；56+ 重（急性中毒/呼吸衰竭：濒死→死亡）。
- **体内毒性随时间衰减（代谢）**：注射后体内毒性 = 净毒性（初始值），每 tick 自然衰减（定稿 1.5），解毒/辅药加速衰减（至 ≈2~3 ❓）。档位按当前体内毒性实时判定——复用「数值 → 区间 buff」机制（同 pain/addiction 架构），急性中毒不是固定时长 debuff，是「体内毒性 ≥56 期间的动态状态」；残毒保底只保证配药产物初始毒 > 0，入体后仍会被代谢清空。
- **致死 = 饿死链式倒计时**：体内毒性 ≥56 期间 `toxicity_ticks` 累计（上限 16 tick）；衰减降到 56 以下即脱离危险、计时清零；倒计时走完未脱离 → `setDead('drug_toxicity')`（死亡原因平级 starvation/energy_shatter）。剂量越高/衰减越慢 = 在致命区待越久 = 越接近死；解毒的意义是把致命区时间压短。初始毒性 ≥80 才会致死（79 存活 / 81 致死 / 100 在 16 tick 内致死）；相冲致死（§10）是另一条近猝死/直接死路径。
- **抵消（比例制 + 残毒保底）**：辅药按比例抵消主药毒性，不直接负毒性相减；总抵消率**封顶 90%**——无论怎么组合都抵消不到 0，残毒恒 ≥ 总毒性的 10%。配得再干净的针也带残毒，永不落「无副作用」档；主药下得越重残毒越大，大剂量不可能被洗成安全。
- **残毒是纯数值保证**（不需要额外剂型底）；刺入的成瘾增量（+12~18）与针具卫生（§3.2）另构成药理/生理层的不可免代价。
- **光放主药 = 净毒性全满 = 迅速致死**。
- **纯功能针（全成分毒性 = 0）净毒性恒为 0**：副作用/衰减/致死模型永不启动——干净；上述致死链只在带毒成分（药成分）入场时启动。

### 9.3 浓度上限

- 注射液有总浓度容量；每种药粉/药片占一个**浓度占用**值，份数 × 占用求和 ≤ 上限。主药、辅药、助剂都占浓度，溶媒是底液不占。
- 浓度上限逼玩家在「主药（嗨）」与「辅药（命）」之间分配——它是整套配比题的支点。

### 9.4 制药台改造（配药模式）

- 制药台在 7 个提取方法之外新增**配药模式**（独立结算，不走固定配方行）：
  - 投入：溶媒 1 + N 味药粉/药片（主/辅/助剂自由组合）。
  - 浓度条 UI：实时显示 Σ浓度占用 vs 上限，超限不给配。
  - 产出：**动态注射液实例**，携带 `components` 列表（各成分 + 份数），药效 = 成分 buff 并集。
  - **不校验相冲**：相冲留到注射后结算（§10）。
- 要动的：药粉/药片加 `concentration_cost`/`effect`/`toxicity` 字段；注射液模板加 `concentration_capacity` + `use_action: inject`；inject 由单 `use_buff_id` 改为一次挂 N 个成分 buff；面板加配药 tab + 浓度条。

### 9.5 待定

- 各药效族的副作用风味标签 → 对应 debuff 具体数值（按 §9.2 档位逐族填）
- **助剂与碱型主药的「必需成盐」判定（2026-09 定稿，已实现）**：
  - 判定对象：`sub_category=pharm_powder` 且 `chem_class ∈ pharmacy_salt_required_chem_classes`（默认 `alkaloid`）且 `pharm_toxicity > 0` 的成分（辅成分/功能成分不强制）。
  - 需求 = Σ(需成盐成分份数) × `pharmacy_salt_dose_per_base_dose`（默认 1）；供给 = Σ(助剂份数 × `adjuvant_strength`)。
  - **供给不足不阻止配药**：产出「**沉淀注射液**」——各族净药效 × `pharmacy_salt_effect_multiplier`（默认 0.5）、净毒性 × `pharmacy_salt_toxicity_multiplier`（默认 1.5），实例带 `precipitated` / `salt_deficit` 标记。
  - 助剂照常占浓度 → 与浓度上限形成双重预算（「加助剂」挤占「加主药」的额度）。
  - 面板在浓度条下方显示「成盐：需 N · 已有 M」或「成盐不足（缺 K）：会析出沉淀」——这是配药台能看见的物理现象，与 §10.4「相冲不给可见信号」不冲突。
  - 助剂只有 `pharm_adjuvant` 形态计入供给；维生素C 的辅成分形态（`med_vitamin_c_powder`）只抵消毒性、不当助剂（§9.1 两形态）。
- ~~疼痛累积/衰减系数 + 伤害→疼痛映射~~ **已定稿**：完整规则见看板 **k229**（累积 = round(实际损毁增量 × 部位汇率 0.1~1.0)；上限 = 25 + 0.75×平均损毁（封顶制）；衰减 = 10 tick 停战后每 4 tick −1；敌我通用；复活清零）。本节下述"累积/衰减"两句为定稿前旧口径。
- 成分数值见 §9.7（roster 首版草稿，❓可调）

---

### 9.6 药效落点（正面效果 → 具体 buff）

| 药效族 | 落点 buff 键 | 数值方向 |
|---|---|---|
| 兴奋 | `survival_delta`（energy/stamina/fatigue）+ `battle_move_speed_multiplier` + `add_stat_delta`（专注） | 精力↑ 体力↑ 疲劳↓ 出手速度× |
| 致幻 | `battle_potential_gain_multiplier` + `battle_combat_experience_gain_multiplier` | 潜能↑ 实战经验↑ |
| 镇静（大麻） | `survival_delta`（mood/nutrition） | 心情↑ 食欲↑ |
| 镇痛 | 压制「疼痛」debuff（见下） | 疼痛效果暂时不生效 |
| 增效（骆驼蓬） | 放大其他药效倍率 | 辅药 |

**功能药效族（功能成分 · toxicity = 0 · 无副作用 · 原料锚定）**

| 功能族 | 原料（真名） | 来源 | 落点 buff 键 |
|---|---|---|---|
| 补液 | 纯净软水 + 海盐 → 生理盐水 | 地表 | 补 thirst/体力 |
| 续航 | 甘蔗 → 葡萄糖液 | 农业 | 补 energy/营养 |
| 复苏（强心） | 兽心提取 | 养殖 | 从昏迷/濒死拉回 |
| 凝血/止血 | 白芨 + 兽骨粉（钙） | 药田/采集 | 部位伤/流血（k142 实装后） |
| 醒神（抗眩晕·预防） | 石菖蒲 | 湿地/药田 | 眩晕抗性窗口（战前打） |
| 续力（负重/壮力） | 鹿茸 | 狩猎/地牢高层 | 负重/力量临时↑ |

- 功能针不是固定成品，是**配方**：配药台选功能成分组合，受浓度预算约束（「补液+醒神+续力」装不下就挑两个）。
- 纯功能针同走 potency 档（原料粗制/精制决定功能强度）；军用爆发针 = 药成分（化工试剂 + 硫磺 + 药草，D2 化工厂），走毒品模型、带副作用。

**疼痛（镇痛的正向落点）**：

- 疼痛做成 **0–100 可见条**（`Survival.state` + `survival-config.json`，与成瘾 `addiction` 同构），复用已有的「数值 → 区间 buff」机制（`survival.js` 的 `MOOD/SATIETY/THIRST/TEMP/DIRTYNESS_RANGE_BUFF_IDS`，新增 `PAIN_RANGE_BUFF_IDS`），零新引擎。
- 累积与衰减：**已定稿，见看板 k229**——累积 = 每击 round(实际损毁增量 × 部位汇率 0.1~1.0)，整数累进；疼痛条上限 = 25 + 0.75×平均损毁（封顶制，够不着高档即不触发）；衰减 = 持续 10 tick 未吃有效损毁后每 4 tick −1；敌我通用；复活清零。（本节旧口径"受伤害涨/治疗包扎时间回落"已废弃。）
- 阈值四档（疼痛要够狠，镇痛才有价值）：0–24 无痛；25–49 轻度疼痛（出手 ×0.90、心情 −2/tick）；50–74 中度疼痛（出手 ×0.80、心情 −4/tick、体力/精力恢复减半）；75–89 重度疼痛（出手 ×0.65、心情 −6/tick、体力 −2/tick）；90–100 剧痛（出手 ×0.60、心情 −8/tick、体力 −3/tick、`disable_actions(move)`：痛到走不动）。
- **镇痛 = 压制疼痛**：镇痛 buff 在场时疼痛区间 buff 效果不生效（debuff 仍在、只盖住）；药效一过疼痛照旧，叠戒断更凶。

---

### 9.7 成分数值总表（roster · 首版草稿 ❓可调）

**全局常量**：`concentration_capacity` = 100；potency 档 ≤33 weak / 34–66 regular / ≥67 potent（封顶）；副作用档 ≤0 无 / 1–25 轻 / 26–55 中 / ≥56 重；抵消上限 90%（残毒 ≥10%）；体内毒性衰减 自然 ~1/tick、解毒加速 ~3/tick；致死倒计时上限 ~40 tick（体内毒性 ≥56 期间累计）。

**药成分（toxicity > 0 · 走副作用模型）**

| 药 | 药效族 | effect | toxicity | cost | 来源 |
|---|---|---|---|---|---|
| 可卡因 | 兴奋 | 90 | 70 | 15 | 古柯·贸易/后期 |
| 吗啡 | 镇痛 | 85 | 65 | 15 | 罂粟·药田 |
| 麦角酸(LSD) | 致幻 | 80 | 68 | 15 | 麦角菌·地牢 |
| 东莨菪碱 | 致幻 | 65 | 75 | 12 | 曼陀罗·采集 |
| 麻黄碱 | 兴奋 | 70 | 55 | 12 | 麻黄·采集 |
| 裸盖菇素 | 致幻 | 55 | 45 | 10 | 裸盖菇·山林 |
| THC | 镇静 | 45 | 30 | 10 | 大麻·药田/贸易 |
| 赤花藤粉 | 兴奋 | 35 | 28 | 8 | 现成 |
| 苦根草粉 | 镇痛 | 30 | 12 | 6 | 现成（入门） |
| 槟榔碱 | 兴奋 | 25 | 18 | 5 | 槟榔·两广 |
| 尼古丁 | 兴奋 | 20 | 15 | 5 | 烟草 |

**辅成分（toxicity < 0 · 抵消）**

| 辅 | effect | toxicity | cost | 备注 |
|---|---|---|---|---|
| 护肝草 | 0 | −40 | 55 | 主力解毒 |
| 骆驼蓬碱 | 0 | −20 | 45 | MAOI·带相冲风险 |
| 番泻叶 | 0 | −25 | 40 | 兼通便风味 |
| 维生素C | 0 | −15 | 25 | 兼助剂；**两形态**：辅成分粉 `med_vitamin_c_powder`（抵消·可相冲）/ 助剂 `adj_vitamin_c`（助溶·不抵消不相冲） |

**功能成分（toxicity = 0 · 无副作用）**

| 功能 | effect | cost | 原料 |
|---|---|---|---|
| 补液粉 | 70 | 15 | 盐 + 软水 |
| 葡萄糖粉 | 60 | 15 | 甘蔗 |
| 强心粉（复苏） | 80 | 25 | 兽心提取 |
| 白芨粉（凝血） | 70 | 20 | 白芨 |
| 石菖蒲粉（醒神） | 60 | 20 | 石菖蒲 |
| 鹿茸粉（续力） | 75 | 30 | 鹿茸 |

**经济注**：主药便宜 → 多药组合自由；辅药贵 → 浓度预算实为「买命预算」，强强联合天然保不住（speedball 语义，可卡因+吗啡这类组合「可以配、配了赌命」）。

---

## 10. 配伍危险（R6）

> 注射不是纯 buff 向：配药本身有真实风险，瞎配一针下去真的会死。危险来自**化学成分相容性**，不是背口诀。实现复用食物「相冲」既有机制（`data/buffs.json` 山核桃仁+酸梅 → `buff_pecan_plum_diarrhoea` 的 `apply_buff_if_has_buffs` 链），零新引擎代码。

### 10.1 化学身份（挂在物品上）

- 每种药粉/药片背后是一条药效 buff（`use_buff_id`）。其**化学成分**作为隐藏标签挂在物品模板（`chem_class`，与现有 `tags` 同源），药效 buff 用 `judgment_tags.chem_class` 继承它（与食物 `food_category`/`food_item` 同构）。
- 成分由提取方法决定（蒸馏→挥发油、浸取→水溶成分、结晶→纯化）；身份是「提取后能被鉴定读出来的隐藏属性」，不是独立中间物品，不占背包格。
- 枚举（草案）：`alkaloid`（生物碱·多苦）/ `tannin`（鞣质·多涩）/ `glycoside`（苷类）/ `volatile_oil`（挥发油·多香）/ `organic_acid`（有机酸·多酸）/ `mineral`（矿物·硫磺钙盐等）。

### 10.2 相冲规则（apply_buff_if_has_buffs）

- 每条药效 buff 的 `effects` 里声明「若血管里同时存在我的相冲类成分 → 授予中毒 buff」，用 `required_judgment_tags` 做**类别级**匹配，不逐对枚举配方。
- 真实化学相冲（配药翻车点）：生物碱+鞣质→沉淀；酸性+碱性→pH 中和沉淀；强心苷+钙→心律毒性；氧化/还原→失效或产毒；溶媒错配→沉淀析出。
- **相冲在注射后结算**（对齐食物相冲「消化时才爆」）：注射液打进后各药效 buff 激活，`apply_buff_if_has_buffs` 在 tick 推进时命中相冲类 → 授予中毒 debuff——「一针下去才死」，配药当场不判定。

### 10.3 结局 buff（会死）

- 相冲命中 → 授予「配伍中毒/急性沉淀」debuff（镜像 `buff_pecan_plum_diarrhoea`）：强 `survival_delta` 负值 + `disable_actions`/`disable_movement` 等。
- 分档：轻症 = 沉淀失效（药白打还带 debuff）；重症 = 急性中毒 → 濒死/死亡。档位按「相冲严重度 + 剂量」定（§10.5）。

### 10.4 摸索与线索

- 与 §7 盲配一致：玩家试错发现；但药草/药粉描述 + 鉴定技能给线索（苦→生物碱、涩→鞣质、香→挥发油），让「死」可复盘，不是抽签。
- **配药时不给可见翻车信号**（不显示沉淀/浑浊/变色），玩家自己记住配方与相冲，一针下去才知道对不对。

### 10.5 待定

- `chem_class` 枚举全表 + 各药草/药粉的成分归属
- 相冲规则表（类别对 → 结局 buff 档位）
- 死亡 vs 濒死的具体阈值与「剂量」如何参与判定
- 注射液浓度上限数值 + 各药粉/药片的浓度占用数值表

---

## 11. 关联文档

`22` 配方统一口径 · `11` 技能/免疫 · `06` 生存 · `18` Buff · `09` 部位 · `19` 动作 · `27` 物品字段 · `43` 消化（食物相冲先例） · `41` 品质移除 · `看板 k142` 异常状态 · `45` 电池 · `16` 任务模板 · `30` 剧情（断药梗）

---

## 12. 验证与回归（2026-09）

| 命令 | 覆盖 |
|---|---|
| `npm run test:pharmacy`（`tools/smoke-pharmacy.mjs`） | 81 组断言：框架六缺口 / 熟练度曲线 / 四途径分流 / 配药（浓度·成盐·沉淀·相冲·增效）/ 成瘾四阶段与压制 / 毒性代谢与致死链 / 针具卫生 / 口服消化 / 药品 roster 契约 / UI tooltip 渲染与信息分级 |
| `npm run build:items` | `data/items/*.csv` → `data/items.json`（含 `pharmacy_base.csv`；重建应与提交版本逐字节一致） |
| `npm run build:pharmacy-buffs` / `--check` | `data/pharmacy-buff-matrix.json` → `data/buffs.json`（幂等，92 条 `buff_pharm_*`） |
| `npm run build:pharmacy-recipes` / `--check` | `data/pharmacy-recipes.json` → `data/recipes.json`（幂等，56 条制药配方） |
| `npm run mark:pharmacy-ingredients` | 按 `alchemy` 标签 + 显式清单标记制药投料（幂等） |
| `npm run audit:item-keys` / `audit:item-field-rules` | 物品字段键与字段显示规则一致性 |

回归基线（2026-09）：`test:pharmacy` 75 组全过，`test:pain` 51 组、`test:hideout-warehouse`、`test:ui-windows`（23）、`test:dungeon-loot`（14）、`test:enemy-drops`（13）、`test:agriculture-map` 全绿。
