## 交易界面数据结构最小字段约定（供前后端共用）

> 本文件只约定**交易界面本身**在一次会话中需要的最小字段集合，用于前后端对齐接口与状态结构。  
> 更完整的物品字段见 `items_template_and_style.md`，更完整的贸易规则见 `basic.md` 与 `trade_ui_layout.md`。

---

## 一、通用说明

- **会话粒度**：一次「玩家 ↔ 单个商人」交易会话，从玩家点选「交易」进入界面，到点击「成交」或关闭界面为止。
- **只在「成交」时落地**：会话内的给/要操作只改**会话临时状态**；只有在点击「成交」按钮时，才写回真实库存与资金池。
- **数据视角**：
  - 「物品结构」以**玩家视角**为主，补充必要的 UI 字段。
  - 「商人结构」聚焦与交易界面直连的字段，不展开行为 AI、移动等内容。

---

## 二、物品结构：最小字段集合

### 2.1 会话前：物品输入（双方库存快照）

用于「玩家可交易物品列表」与「商人可交易物品列表」的初始数据。  
以下字段以**单一物品行**为单位描述：

- **item_id**
  - 类型：`string`
  - 含义：物品内部唯一 ID，对应物品表中的 `id`。
  - 用途：作为交易行、库存变更与日志的主键引用。

- **name**
  - 类型：`string`
  - 含义：当前应展示的物品名称（可能是 `sn` 或 `placeholder_name`，由语言/鉴定状态决定）。
  - 用途：双列表每行的「物品名」文本。

- **icon**（可选）
  - 类型：`string | null`
  - 含义：物品图标资源 ID 或路径。
  - 用途：前端在物品名左侧展示小图标；若无图标可为空。

- **count**
  - 类型：`int`
  - 含义：本会话开始时，该物品在当前持有者真实库存中的数量。
  - 用途：决定「全都给 / 全都要」上限与初始 `session_available_count`。

- **base_value**
  - 类型：`number`
  - 含义：物品表中的「基线价值」，仅用于内部估值计算。
  - 用途：驱动「你觉得XX、对方觉得XX」的五档感受词；**不在任何界面直接展示**。

- **tags**
  - 类型：`string[]`
  - 含义：物品的用途/类别标签集合（如 `["ore","material"]`、`["currency"]`）。
  - 用途：供估值算法按商人偏好加权，例如「喜爱矿石」「厌恶易腐食品」。

> 以上字段从物品表/配置读取，作为会话的**只读输入**，不在本会话内被修改。

### 2.2 会话内：物品的临时状态字段

会话开始时，为每个参与交易的物品附加以下**会话级字段**。  
这些字段只在当前会话内存在，成交/取消后即被丢弃或重置。

- **session_available_count**
  - 类型：`int`
  - 初始值：`count`
  - 含义：本会话中「还可以用于本次交易操作」的数量。
  - 规则：
    - 玩家点击「给 N 个 / 全都给」时：从玩家侧对应物品的 `session_available_count` 中扣减。
    - 玩家点击「要 N 个 / 全都要」时：从商人侧对应物品的 `session_available_count` 中扣减。
    - 不随步进按钮变化；只在真正执行给/要动作时变动。

- **session_delta_give**
  - 类型：`int`
  - 初始值：`0`
  - 含义：**玩家视角**下，本会话计划「从玩家给出去」该物品的数量（若该物品初始在玩家手上）。
  - 规则：
    - 每次玩家对自己持有的该物品执行「给 N 个 / 全都给」时，累加或覆盖为最新的计划值（实现可选择「累加模式」或「直接设为最新 N」）。
    - 用于结算时从玩家真实库存中扣减。

- **session_delta_take**
  - 类型：`int`
  - 初始值：`0`
  - 含义：**玩家视角**下，本会话计划「从商人拿到」该物品的数量（若该物品初始在商人手上）。
  - 规则：
    - 每次玩家对商人持有的该物品执行「要 N 个 / 全都要」时更新。
    - 用于结算时加入玩家真实库存。

> 实现时也可以将 `session_delta_give` 与 `session_delta_take` 合并为一个带符号的 `session_delta`（玩家给为负、拿为正），本文件保留「拆分版」以便前后端理解与调试。

### 2.3 会话内：用于估值与感受词的聚合字段（可由后台计算）

以下为**整场会话级**的临时聚合值，不要求前端逐条维护，但需要在接口或内部状态中存在：

- **V_player_give**
  - 类型：`number`
  - 含义：按当前所有 `session_delta_give` 计算的「玩家给出的物品内部价值总和」。
  - 计算示意：  
    `V_player_give = Σ( value_i_per_unit × session_delta_give_i )`

- **V_player_get**
  - 类型：`number`
  - 含义：按当前所有 `session_delta_take` 计算的「玩家将获得的物品内部价值总和」。
  - 计算示意：  
    `V_player_get = Σ( value_i_per_unit × session_delta_take_i )`

- **r_player**
  - 类型：`number`
  - 定义：`r_player = V_player_get / max(V_player_give, ε)`
  - 用途：映射为玩家侧的五档感受词（不行 / 略亏 / 可以 / 略赚 / 很赚）。

- **r_merchant**
  - 类型：`number`
  - 定义：`r_merchant = V_player_give / max(V_player_get, ε)`
  - 用途：映射为商人侧的五档感受词，用于「[交易对象] 觉得 XX」。

---

## 三、商人结构：最小字段集合

交易界面只关心与「当前这位商人」相关的、会在 UI 或结算中直接使用到的字段。

### 3.1 身份与展示

- **merchant_id**
  - 类型：`string`
  - 含义：商人内部唯一 ID。
  - 用途：日志、存档、资金池与商誉等更新时的主键引用。

- **merchant_type**
  - 类型：枚举 `Vendor / ShopOwner / Caravan`（或与设计文档中的摊贩/店主/旅行商队对应的英文枚举）
  - 用途：决定允许出现的 `scene_type` 与部分文案风格。

- **display_name**
  - 类型：`string`
  - 含义：在标题栏与感受行中展示的称呼（如「摊贩」「老者」「旅行商队」等）。
  - 用途：
    - 标题栏文案：「[display_name] 说能用 [货币名]、[货币名] 交易」。
    - 感受行文案：「你觉得 [感受词]，[display_name] 觉得 [感受词]。」。

### 3.2 交易规则与金额边界

- **accepted_currencies**
  - 类型：`string[]`
  - 含义：该商人当前场景下可接受的货币短码列表，对应货币表的 `accept_code`。
  - 用途：
    - 标题栏「能用 [货币名] 交易」文案。
    - 结算时判断哪些物品视为货币、可用于扣款或支付。

- **fund_pool_current**
  - 类型：`number`
  - 含义：本场景下、当前这位商人**尚可用于支付给玩家**的资金总额（内部价值）。
  - 用途：玩家卖货时，校验是否超出资金池；超出的部分转为地区商誉增量。

- **fund_pool_max**
  - 类型：`number`
  - 含义：本场景下这位商人的资金池上限，用于初始化 `fund_pool_current` 与调试。

- **max_single_trade_amount**
  - 类型：`number`
  - 含义：按当前 `scene_type`（Market / Shop / Travel 等）允许的**单笔交易金额/数量上限**。
  - 用途：限制一次成交中，金额或件数的最大值，避免在小额场景中一次性完成过大交易。

### 3.3 估值偏好（最小版）

用于在价格计算中对不同物品做加权，驱动感受词与 NPC 主观判断。

- **preferred_tags**
  - 类型：`string[]`
  - 含义：商人偏好的物品标签集合（如更愿意收「粮食」「矿石」）。
  - 用途：在内部估值计算时提高相关物品的 `item_tag_coef`，使其在本商人眼中更值钱。

- **disliked_tags**
  - 类型：`string[]`
  - 含义：商人不愿意收或收购价显著偏低的物品标签集合。
  - 用途：在内部估值计算时降低相关物品的 `item_tag_coef`。

- **price_bias**
  - 类型：`number`（建议范围 `0.9–1.1`）
  - 含义：该商人整体「偏贵 / 偏便宜」的系数。
  - 用途：在统一价值计算公式中作为 `merchant_bias` 使用。

---

## 四、统一价值计算接口（供实现参考）

本小节仅给出公式接口，具体数值与系数由实现或配置表决定。

- **单件物品内部价值（会话用）**

  - 公式：  
    `value_i = base_value_i × region_coef × merchant_bias × item_tag_coef`

  - 其中：
    - `base_value_i`：来自物品表。
    - `region_coef`：地区物价系数，可先简化为常量。
    - `merchant_bias`：商人字段 `price_bias`。
    - `item_tag_coef`：按物品 `tags[]` 与商人 `preferred_tags[]` / `disliked_tags[]` 决定的权重。

- **会话级聚合值**

  - 玩家给出价值：`V_player_give`  
  - 玩家获得价值：`V_player_get`
  - 玩家视角比值：`r_player = V_player_get / max(V_player_give, ε)`
  - 商人视角比值：`r_merchant = V_player_give / max(V_player_get, ε)`

前端只需关心「五档感受词」枚举与当前选中的两档；后台可在每次会话状态更新时重新计算并将结果回传。

---

## 五、会话收尾与数据落地（字段层面）

当玩家点击「成交」按钮时，后台需按以下字段完成落地：

1. **库存变更**
   - 对每个物品：
     - 若 `session_delta_give > 0`：从玩家真实库存中扣减对应数量，并加入商人真实库存。
     - 若 `session_delta_take > 0`：从商人真实库存中扣减对应数量，并加入玩家真实库存。
   - 货币类物品按同样规则处理。

2. **资金池与商誉**
   - 根据玩家「卖出」给商人的货物，计算本笔需要支付给玩家的金额，与 `fund_pool_current` 比较：
     - 在资金池范围内的部分：正常支付，`fund_pool_current` 扣减。
     - 超出资金池部分：不再支付金钱，转为地区商誉增量（字段接口可约定为 `delta_reputation(region_id, merchant_faction_id)`）。

3. **会话字段清理**
   - 清空所有物品上的 `session_available_count`、`session_delta_give`、`session_delta_take` 等会话级字段。
   - 清空本会话内的聚合值 `V_player_give`、`V_player_get`、`r_player`、`r_merchant` 等。
   - 刷新前端列表展示，并根据实际设计选择直接关闭窗口或回到初始列表状态。

> 至此，交易界面所需的物品与商人数据结构最小字段集合已定义完毕，可据此设计前后端的请求/响应与内部会话状态结构。

---

## 六、地区-货物池、库存模板与商人 Override 结构约定

> 本节对应「商人物品库存生成机制」方案中的概念层（见 `basic.md` 9.3 与 `trader_template.md`），只定义字段结构与示例，具体数值可在后续实现阶段再行细化。

### 6.1 地区-货物池（Region–Goods Pool）

**用途**：描述「某地区 + 某货物大类」在**库存生成时可被抽样**的物品池，与价格、供需系统解耦，仅决定「有哪些货物可以出现在商人库存里」及其基础出现权重。

- **region_goods_pools.csv**（示意）
  - **字段列表**：
    - `region_id`
      - 类型：`string`
      - 含义：地区/行省 ID，需与地区配置表保持一致。
    - `goods_major_class`
      - 类型：枚举 `life` / `material` / `product` / `luxury` 等
      - 含义：货物大类；与 `basic.md` 9.3 的商品分类和物品表中的 `price_class`、`category` 对齐。
      - 示例映射：
        - 生活物资池 → `life`
        - 生产材料池 → `material`
        - 成品/工具池 → `product`
        - 奢侈/稀有池 → `luxury`
    - `item_id`
      - 类型：`string`
      - 含义：可出现在本池中的物品 ID，对应物品表 `id`。
    - `base_weight`
      - 类型：`number`
      - 含义：在本地区本大类池中的基础抽样权重；仅用于「被选中概率」，与价格无关。
    - `rarity_tag`（可选）
      - 类型：`string`
      - 含义：粗略稀有度标记，如 `common` / `uncommon` / `rare` / `legendary`，供库存模板在「稀有槽位」中优先抽取。
    - `tags_filter_hint`（可选）
      - 类型：`string`
      - 含义：与物品 `tags` 相关的补充信息，如 `food;perishable`，供未来供需/事件系统调整权重时使用。

  - **示例（同一地区的部分记录）**：
    - `region_id = bay_tide`、`goods_major_class = life`：
      - `item_id = food_dried_meat`, `base_weight = 10`, `rarity_tag = common`
      - `item_id = food_clean_water_small`, `base_weight = 15`, `rarity_tag = common`
      - `item_id = cloth_simple`, `base_weight = 6`, `rarity_tag = common`
    - `region_id = bay_tide`、`goods_major_class = luxury`：
      - `item_id = jewelry_shell_necklace`, `base_weight = 2`, `rarity_tag = rare`

> 实现备注：未来若接入供需与事件系统，可在不改动该表结构的前提下，通过附加「地区-时间-事件」修正规则对 `base_weight` 做动态调整。

### 6.2 库存模板档位（Stock Profile）

**用途**：按「商人类型 + 场景类型」给出一套**库存形状模板**，规定总格数、各货物大类数量区间、是否有稀有槽位等。库存生成流程在确定模板后，从对应地区的货物池中抽样填充。

- **stock_profiles.csv**（示意）
  - **字段列表**：
    - `stock_profile_id`
      - 类型：`string`
      - 含义：库存模板档位 ID，供商人模板引用，例如 `stock_basic_vendor`、`stock_large_shop_weapon`。
    - `scene_type`
      - 类型：枚举 `Market` / `Shop` / `Exchange` / `Travel`
    - `merchant_type_default`
      - 类型：可选枚举 `Vendor` / `ShopOwner` / `Caravan` / 空
      - 含义：该模板的典型适用商人类型，可为空表示通用模板。
    - `slot_count_total`
      - 类型：`int`
      - 含义：本商人在该模板下的**理论库存格位上限**（不含玩家以物易物后留下的新货物）。
    - `slot_life_min` / `slot_life_max`
      - 类型：`int`
      - 含义：生活物资大类在本模板下的目标数量区间。
    - `slot_material_min` / `slot_material_max`
      - 类型：`int`
      - 含义：生产材料大类的目标数量区间。
    - `slot_product_min` / `slot_product_max`
      - 类型：`int`
      - 含义：成品/工具大类的目标数量区间。
    - `slot_luxury_min` / `slot_luxury_max`
      - 类型：`int`
      - 含义：奢侈/稀有品大类的目标数量区间。
    - `rare_slot_count`
      - 类型：`int`
      - 含义：在总库存中预留的「稀有槽位」数量（0 表示无稀有槽位）；填充时优先从 `goods_major_class = luxury` 或稀有池抽取。
    - `allow_cross_region_goods`
      - 类型：`bool`
      - 含义：是否允许从商人 `merchant_homeland` 对应地区的货物池中抽取少量货物（旅行商队用于携带他乡特产）。
    - `stack_range_life`
      - 类型：`string`（形如 `"3-15"`）
      - 含义：生活物资单件库存的数量（堆叠）范围，最终仍需与物品表 `stack_limit` 兼容。
    - `stack_range_material` / `stack_range_product` / `stack_range_luxury`
      - 类型：同上
      - 含义：其他大类的堆叠范围。

  - **模板示例**：
    - `stock_profile_id = stock_basic_vendor_market`
      - `scene_type = Market`
      - `merchant_type_default = Vendor`
      - `slot_count_total = 20`
      - `slot_life_min = 8`, `slot_life_max = 14`
      - `slot_material_min = 2`, `slot_material_max = 5`
      - `slot_product_min = 1`, `slot_product_max = 3`
      - `slot_luxury_min = 0`, `slot_luxury_max = 1`
      - `rare_slot_count = 0`
      - `allow_cross_region_goods = false`
      - `stack_range_life = "3-15"`
      - `stack_range_material = "2-8"`
      - `stack_range_product = "1-4"`
      - `stack_range_luxury = "1-1"`
    - `stock_profile_id = stock_travel_caravan_small`
      - `scene_type = Travel`
      - `merchant_type_default = Caravan`
      - `slot_count_total = 24`
      - `slot_life_min = 10`, `slot_life_max = 16`
      - `slot_material_min = 3`, `slot_material_max = 6`
      - `slot_product_min = 2`, `slot_product_max = 4`
      - `slot_luxury_min = 1`, `slot_luxury_max = 2`
      - `rare_slot_count = 2`
      - `allow_cross_region_goods = true`
      - 堆叠范围可与上述类似。

> 实现时，可在代码中将上述字段加载为结构体/对象，在库存生成流程中先确定 `stock_profile_id` 再行抽样。

### 6.3 商人实例 Override（与 `trader_template.md` 对齐）

**用途**：在具体商人配置中，对「默认库存模板 + 地区货物池」进行**个体化覆写**，包括指定模板、固定必有物品、白/黑名单等。与资金池、限额等字段并列存在。

- 在 `trader_template.md` 对应的商人配置表中，补充/约定以下字段（示意名）：
  - **stock_profile_id**
    - 类型：`string | null`
    - 含义：显式指定本商人使用的库存模板；为空时按 `merchant_type` + `scene_type` 的默认映射选择。
    - 示例：`stock_basic_vendor_market`、`stock_travel_caravan_small`。
  - **fixed_items**
    - 类型：结构化列表或单独 CSV 表，字段示例：
      - `item_id`：固定必有物品 ID。
      - `count_min` / `count_max`：本商人刷新时该物品数量的随机区间。
      - `is_quest_item`：是否为任务/剧情相关物品（影响售卖与刷新逻辑）。
    - 含义：这些物品在库存生成时**优先放入**，占用格位但不参与随机抽样。
  - **whitelist_tags**
    - 类型：`string[]`
    - 含义：本商人偏好或只经营的物品标签白名单，如 `["medicine","herb"]`、`["tool","ore"]`。
    - 作用：在从地区货物池抽样时，**优先选择**带有这些标签的物品；也可配置为「只允许这些标签出现」的强白名单模式（由实现决定）。
  - **blacklist_tags**
    - 类型：`string[]`
    - 含义：本商人不经营或严禁出现的物品标签，如 `["contraband","spoiled"]`。
    - 作用：在抽样时**排除**带有这些标签的物品，即使其在地区货物池中存在。
  - **override_region_id**（可选）
    - 类型：`string | null`
    - 含义：若非空，则本商人的库存抽样**优先视为该地区货物池**，用于模拟在异乡开店但主要售卖故乡货物的情况。

- **商人实例示例（文字版）**：
  - 「湾岸市场里的药材摊贩」：
    - `merchant_type = Vendor`
    - 默认 `scene_type = Market`
    - `stock_profile_id = stock_basic_vendor_market`
    - `fixed_items`：
      - `item_id = herb_basic_pain_relief`, `count_min = 3`, `count_max = 6`
    - `whitelist_tags = ["medicine","herb"]`
    - `blacklist_tags = ["luxury","contraband"]`
  - 「路上的旅行商队（来自内陆行省）」：
    - `merchant_type = Caravan`
    - `scene_type = Travel`
    - `stock_profile_id = stock_travel_caravan_small`
    - `fixed_items` 可为空或只列出该商队的招牌货物。
    - `whitelist_tags = ["life_good","material"]`
    - `blacklist_tags = ["spoiled"]`
    - `override_region_id = inland_province_1`（使其在外地行进时仍大量携带内陆特产）。

> 以上三层结构共同构成了「地区 → 货物池 → 库存模板 → 商人实例 Override」的库存生成骨架：实现时仅需围绕 `region_goods_pools`、`stock_profiles` 与商人上的覆写字段完成抽样与刷新逻辑，即可得到可运行的最小版本。

