# 42 · 材料分配：地表 + 七座主题地牢

> 配合 `41-quality-removal.md`：**稀有度 = 物品身份（不同 `item_id`）**。本文档把现有 `data/items.json` 的材料（herb/ore/wood/hunt/textile/seed）与建议新增的材料，分配到**地表**与**七座主题地牢**（对应七阀），并给出层数档位与实现挂钩。

## 一、分配原则

1. **地表 = 基础档**：常见木（橡/榉）、基础矿、常见菜蔬药草、基础猎物、全部作物种子（种植/畜牧是家常活动）。
2. **七地牢 = 主题进阶档**：按对应阀的产业归口；每座地牢内**层数 = 稀有度**（1-4 主题基础款 → 5-8 进阶 → 9-12 稀有 → 13-16 独有）。
3. **新手地牢 + 野外随机单层地牢 = 地表池的高品质来源**：不出地表没有的东西，只调权重/掉率，另加少量专属入门件，托底「入门套」。
4. **15 道终局菜（`life-cooking-final-goals`）的稀料 = 深地牢**，常见料 = 地表/种植/畜牧——「传说菜 = 要下对应主题地牢深层」。
5. **电池不进采集池**：敌人掉落 + 电箱产物（见电池经济）；D6/D7 敌人重点掉充电电池/蓄电池。

## 二、地表基础池（野外 / 家的南边 / 去金木镇的路 / 家外田地）

| 类别 | 材料（现有 id） |
|---|---|
| 伐木 | `wood_oak` 橡木、`wood_zelkova` 榉木、**`wood_birch` 桦木（新增）**、`wood_bamboo_green` 绿竹、`wood_firewood` 柴、`wood_bits` 木屑、`wood_shrub_dry` 干灌木、`wood_charcoal` 木炭 |
| 挖矿 | `ore_clay_raw` 陶土、`ore_limestone` 石灰石、`ore_salt_sea` 海盐、`ore_salt_sea_coarse` 粗海盐、`ore_salt_rock` 岩盐、`ore_copper_raw` 粗铜、`ore_iron_raw` 铁矿石 |
| 采集 | `herb_green/sweet/bitter`、`herb_leaf_fresh`、`herb_root_bitter`、`herb_vine_red`、`herb_shiitake`、`herb_mushroom_floral`、葱姜蒜洋葱、`herb_parsley/cilantro/thyme/rosemary/sage/oregano/bay_leaf/dill/mustard_yellow`、`herb_cherry/pear/lemon/peanut/chestnut/pecan`、`wild_fruit_red/purple/yellow` |
| 狩猎 | `hunt_meat_rabbit/boar/deer`、`hunt_turkey`、`hunt_squab`、`hunt_bone_common`、`hunt_salo` |
| 纺织 | `textile_cocoon_wild` 野蚕茧 |
| 种植（家/田地） | 全部 `seed_*` + 对应作物 |

**新手地牢 / 野外随机地牢**：上表材料（权重/掉率按档），另给少量入门专属件（入门木剑/皮衣材料等），掉落对齐「新手入门套」等级。

## 三、七座主题地牢

**D1 瞎子 · 高山哨塔**（北·山区·情报暗哨·森林香料）
- 现有：`herb_juniper_berry` 杜松子、`herb_bamboo_shoot_winter` 冬笋、`herb_mushroom_floral`（深山）、`herb_cardamom_black/green` 豆蔻、`herb_nutmeg/mace` 肉豆蔻与豆蔻皮、`herb_clove` 丁香、`herb_black_pepper_whole` 黑胡椒（**森林香料，自 D5 匀来**）
- 新增：`wood_pine` 松木、`herb_alpine_herb` 高山药草、`resin_pine` 松脂、`ore_granite` 花岗岩、`hunt_mountain_goat` 山羊、`hunt_feather` 猛禽羽毛

**D2 哑巴 · 化工厂药田**（西·毒与药）
- 现有：`herb_ginseng` 人参、`herb_goji` 枸杞、`herb_saffron` 藏红花、`herb_vanilla_pod` 香草荚、`herb_root_bitter`、`ore_salt_black` 黑盐、`ore_lime_water` 石灰水、`ore_water_pure_soft` 纯净软水、`ore_spirit_crystal` 灵息矿晶
- 新增：`chem_reagent` 化工试剂、`herb_poison_plant` 毒草、`hunt_venom_sac` 毒囊

**D3 瘸子 · 主锻炉**（西南·铁与火）
- 现有：`ore_cast_iron` 铸铁、`ore_iron_sand_highcarbon` 高碳铁砂、`ore_steel_ingot` 钢锭、`wood_charcoal_fruit` 果木炭、`wood_firewood_fruit`、`wood_firewood_rubber` 橡胶木
- 新增：`ore_sulfur` 硫磺、`ore_scrap_metal` 废铁、`oil_heavy` 重油（油罐区）、`forge_flux` 锻炉熔剂

**D4 孤儿 · 矿坑拳场**（东·矿与暗杀）
- 现有：`ore_iron_raw`、`ore_copper_raw`、`ore_spirit_crystal`、`ore_limestone`（全部只出稀有档，需较深层）
- 新增：`gem_ruby` 红宝石、`gem_sapphire` 蓝宝石、`ore_gold_raw` 金矿、`ore_silver_raw` 银矿、`hunt_horn` 兽角

**D5 卷毛 · 沿岸堂口**（东南·南洋热带香料与海产）
- 现有：`herb_kombu` 昆布、`wood_coconut` 椰子、`ore_salt_sea`（稀有档）、`herb_cacao_pod` 可可、`herb_candlenut` 石栗、`herb_bunga_kantan` 火炬姜花、`herb_laksa_leaf` 叻沙叶、`herb_galangal` 南姜（**南洋/热带组：凑齐娘惹叻沙**；森林香料已匀给 D1）
- 新增：`hunt_fish_bonito` 鲣鱼、`hunt_fish_eel` 海鳗、`hunt_shrimp` 虾、`hunt_crab` 蜘蛛蟹、`hunt_mussel` 贻贝、`hunt_cockle` 血蚶、`hunt_abalone` 鲍鱼、`hunt_sea_cucumber` 海参、`hunt_fish_maw` 鱼胶、`hunt_scallop_dried` 瑶柱、`textile_coir` 椰纤维

**D6 四眼 · 城市废墟**（广州佛山·消费电子/信息/奢侈品）
- 现有：`textile_cocoon_domestic` 家蚕茧、`wood_apple/orange/olive`（城市果树）、`herb_orange_peel_dried`
- 新增：`electronic_wire` 铜线、`electronic_component` 电子元件、`paper_scrap` 旧书残页（配方/情报线索载体）、`leather_fine` 精制皮革、`item_porcelain` 瓷器、`item_glass` 玻璃、`food_wine` 酒；敌人重点掉 `battery_rechargeable` 充电电池

**D7 青面仔 · 地下暗道**（中山虎门·旧设施/电力/运输）
- 新增：`metal_pipe` 金属管道、`mechanical_parts` 机械零件、`battery_storage` 蓄电池（电力囤积）、`generator_parts` 发电机零件、`supply_crate_old` 旧储备物资、`electronic_wire`（工业级铜缆，与 D6 共用）

**D6 / D7 分工**：D6 = 家用电子/信息/奢侈品（市民生活）；D7 = 工业设备/机械/电力（基础设施）。**电池、电箱相关集中在 D7**，D6 掉消费级充电电池。

## 四、电池与电箱（非采集材料）

- **掉落**：敌人身上少量掉落；浅层小兵掉五号/干电池（一次性），越深掉率越高、容量越大（深层稀有蓄电池）。
- **电箱**：深层专属、稀疏、单箱电量有限；投币式放置 → 并行充电 → 提示 X tick 充满 → 可离开、回来取；附近刷敌人（只打玩家，不打电箱）。详细规则见[45 电池经济数值骨架](45-battery-economy.md)（§五 预留口径，数值待 k91 实现时回填）。

### 四·1 实现记录（k89，电池物品 + 敌人掉落）

- **电池物品**（`data/items.json` + `materials_all.csv`，双写防 build:items 丢失）：
  - `battery_aa` 五号电池（一次性干电池）：容量 100、电量 100、地区 0（全局）、`base_value` 80；
  - `battery_rechargeable` 充电电池：容量 400、地区 8（D6）、`base_value` 400；
  - `battery_storage` 蓄电池：容量 1500、地区 9（D7）、`base_value` 1000。
  - **新字段**：`battery_capacity`（容量）/ `battery_charge`（电量）——`build-items-json.mjs` 支持（电量缺省 = 容量满电）；实例可带 `battery_charge` 表示当前电量（`copyItemInstance` 保留），tooltip 实例值优先于模板（`item-field-display-rules.js`）。
- **敌人掉落数据**：`data/enemy_drops.json` —— `battery_tiers` 四档（1-4 / 5-8 / 9-12 / 13-16，与 dungeon-loot `tierIndexForFloor` 对齐）：浅层只出五号，深层出充电/蓄电，掉率逐档上升（0.25→0.55）；`charge_roll` 电量 = 容量 × 30%~100%（拾荒/偷电半电 lore）；`enemies` 表可按敌人调 `chance_mult`（`enemy.street_thug` 0.8 作首个接线示例）。
- **纯逻辑**：`js/enemy-drops.js`（`rollEnemyBatteryDrop`：掉率 → 权重抽项 → 地区门控 → 电量 roll；可单测）。**运行时接线（敌人死亡 → 结算掉落入包）已落地**（k89 收尾：`scene-app.js` `settleEnemyBatteryDrops`，背包满则掉尸体格；`combat.log.enemy_drop_battery*` 日志；map.floor / map.region_code 缺省地表）。
- **牧场供电消费端**（最小闭环）：`data/livestock-modules.json` 需电模块加 `power_drain_per_tick`（大型臂 1 / 轴心仓储·气候 2，schema v3）；`livestock-state.js` 新增 `power_charge` 储能（起步 500，旧档 `power_available` 迁移）+ `addPowerCharge/getPowerCharge/currentPowerDrainPerTick/drainPowerForTick`，每 tick 末按需电模块合计扣电、耗尽停摆（k93 生产力墙复用）；畜牧面板「🔋 塞电池」弹层把背包电池整格塞入储能（`livestock-panel.js` + `#livestock-power-picker`）。数值已由[45 电池经济数值骨架](45-battery-economy.md)锚定（打一次洞 ≈ 1000 电 = 大型臂 1 轮），与实现一致。
- **校验**：`npm run test:enemy-drops`（`tools/test-enemy-drops.mjs`）、`npm run test:livestock-power-feed`（`tools/smoke-k89-power-feed.mjs`，新增）、`npm run test:livestock-power`（k93 回归）——物品字段、四档结构、掉率/地区/电量边界、储能扣电/耗尽/塞电恢复、旧档迁移。

## 五、15 道终局菜稀料覆盖核对

藏红花/香草荚/人参/枸杞 → D2；**森林香料（豆蔻/肉豆蔻/丁香/黑胡椒）→ D1，南洋热带组（可可/石栗/火炬姜花/叻沙叶/南姜）→ D5**——娘惹叻沙的料被摊到 D1+D5 两座地牢（香料分布均匀化，代价是「凑齐一道传说菜」要多跑一座，符合本作旅行成本哲学）；鲍鱼/海参/鱼胶/瑶柱/鲣鱼/海鳗 → D5 深层；其余常见料全部落地表/种植/畜牧。**「传说菜 = 要下对应主题地牢深层」成立。**

## 六、已拍板项/决策记录

1. **桦木**：**已定新增 `wood_birch` 桦木**（加入地表伐木池；需在 `items.json` 建条目）。
2. **新增材料体量**：**已定 D5 海产十个全要**（鲣鱼/海鳗/虾/蜘蛛蟹/贻贝/血蚶/鲍鱼/海参/鱼胶/瑶柱）。
3. **铜铁分工**：**已定**「基础金属地表有（粗铜/铁矿石）、进阶金属洞里挖」。
4. **香料归属**：**已定摊匀**——森林香料（豆蔻/肉豆蔻/豆蔻皮/丁香/黑胡椒）→ D1；南洋热带组（可可/石栗/火炬姜花/叻沙叶/南姜）→ D5。

## 七、实现挂钩

- **`region_restrict`**：物品模板字段（`0` = 全局，非 `0` = 限定地区）——按本文档把每类材料标上对应地牢/地表地区编码。
- **`tags`**：新增 `dungeon_only` / `surface_only` 标签，供掉落池与生成器过滤。
- **掉落表**：每座地牢配一张 `loot_table`（行 = `item_id` + `weight`，无品质档），地牢生成器按层数档位选表。
- **新材料的 `sn` / `placeholder_name` / `fn_before` / `fn`** 按 `capitalism/items_template_and_style.md` 规范补写。

### 七·1 实现记录（k85，已落地）

- **地区编码注册表**：`data/regions.json`（新文件）。`region_restrict`：`0` = 全局；`1` 地表；`2` 新手地牢；`3`~`9` = D1~D7。**跨区物品填 `0`**（如 `ore_iron_raw` 地表+D4、`electronic_wire` D6+D7、`ore_spirit_crystal` D2+D4），由各地 loot_table 精确门控。
- **标签**：`dungeon_only`（76 个）/ `surface_only`（48 个）已打在 `data/items.json` 与 `data/items/*.csv`（materials_all / consumables_base 两表，防 `npm run build:items` 丢改动）；跨区物品不带粗标签（纯地牢跨区如 `electronic_wire`/`ore_spirit_crystal` 仍带 `dungeon_only`）。
- **掉落表**：`data/loot_tables.json` 新增 9 张地区表——`loot_surface`（平铺数组）+ `loot_beginner`、`loot_d1`~`loot_d7`（`{ tiers: [4 档 × {item_id, weight}] }`）。行仅 `item_id + weight`，无品质档。
- **层数档位**：`tierIndex = clamp((floor-1)/4)`（1-4 主题基础款 / 5-8 进阶 / 9-12 稀有 / 13-16 独有，与 44 §三对齐）。选表逻辑唯一事实源：`js/dungeon-loot.js`（`getRows` / `tierIndexForFloor` / `roll` / `filterRowsByRegion`）。
- **新手地牢**：`region_gated=false`（regions.json）——它是地表池的高品质来源（§二.3），`loot_beginner` 显式枚举地表材料并调权重，生成器不做 region_restrict 过滤；七座主题地牢与地表 `region_gated=true`。
- **电池**（`battery_rechargeable`/`battery_storage`）：按 §一.5 **不进采集池**——不入任何 loot_table，仅打 `dungeon_only` + 地区码（D6/D7）供敌人掉落（k89）使用。
- **校验**：`npm run test:dungeon-loot`（`tools/test-dungeon-loot.mjs`）——层数→档位、表结构、行 id 存在性、地区一致性、电池不泄漏、标签分布。补数据可重跑 `tools/apply-k85-material-regions.mjs`（`--dry-run` 先看计划）。
