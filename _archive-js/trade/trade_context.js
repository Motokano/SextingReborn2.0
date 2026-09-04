/**
 * 交易 UI 使用的核心数据结构定义。
 *
 * 对齐文档：
 * - capitalism/basic.md 第 9 章（尤其 9.2.1 交易上下文、9.7 以物易物与价值计算）
 * - items_template_and_style.md（物品字段与 base_value、tags 等）
 *
 * 本文件仅定义前端 Canvas 层需要的「会话内快照」与接口形状，
 * 具体数值公式由外部逻辑模块实现，通过注入的 valueCalculator / feelingCalculator 提供。
 */

/**
 * 场景类型，对应 basic.md 9.2.1 的四档场景。
 * @typedef {"Market" | "Shop" | "Exchange" | "Travel"} TradeSceneType
 */

/**
 * 单件可交易物品在当前会话中的最小展示单元。
 * 仅保留交易 UI 所需字段，其余从物品表按需补充。
 *
 * 对齐 items_* 表中的字段：
 * - id           → itemId
 * - sn / placeholder_name → displayName（已按语言/鉴定状态选好）
 * - base_value   → baseValue
 * - tags         → tags
 *
 * @typedef {Object} TradeItem
 * @property {string} itemId           物品内部唯一 ID（来自各类 items_* 表）
 * @property {string} displayName      UI 当前应展示的名称（已考虑语言与鉴定）
 * @property {number} stackCount       会话开始时该堆叠的数量（不含会话内 pending）
 * @property {number} baseValue        估值起点：建议填 `ItemValue.getEffectiveBaseValue(itemId,{instance})`（品质档每级默认 +10% 基价）；未接品质时可用模板 base_value
 * @property {string[]} tags           用于价值修正与过滤的用途标签集合
 * @property {boolean} isCurrency      是否为货币类物品（category=currency）
 */

/**
 * 会话内一行物品的库存与交易相关信息。
 * UI 列表使用该结构绘制每一行。
 *
 * @typedef {Object} TradeInventoryRow
 * @property {TradeItem} item          物品基础信息
 * @property {number} availableCount   当前可用于本次交易的数量（会话内扣减后实时变化）
 * @property {boolean} tradeLocked     是否本场景/本商人禁止交易该物（如任务锁定）
 */

/**
 * 单个 pending 行（待结算的给出/拿取数量），
 * 用于在双方列表中标记「这次打算给/要多少」。
 *
 * @typedef {Object} PendingLine
 * @property {string} itemId           对应的物品 ID
 * @property {number} count            会话内累计的待结算数量（>0 有效）
 */

/**
 * 用于以物易物内部统一价值计算的接口。
 * 具体公式见 basic.md 9.7.1：value_i = base_value × region_coef × merchant_bias × item_tag_coef。
 *
 * UI 侧不关心实现细节，只依赖该函数返回当前会话下的 value_i。
 *
 * @callback ValueCalculator
 * @param {TradeItem} item            物品基础信息（含 baseValue 与 tags）
 * @param {TradeContext} context      当前交易上下文（含 sceneType、merchant 等）
 * @returns {number}                  本会话下该物品的内部统一价值 value_i
 */

/**
 * 一次会话内双方给出/获得的聚合结果，
 * 对应 basic.md 9.7.1 中的：
 * - V_player_give / V_player_get
 * - V_merchant_get / V_merchant_give
 *
 * @typedef {Object} TradeValueSummary
 * @property {number} V_player_give
 * @property {number} V_player_get
 * @property {number} V_merchant_get
 * @property {number} V_merchant_give
 */

/**
 * 五档感受词枚举，对应 basic.md 9.7.2。
 * @typedef {"不行" | "略亏" | "可以" | "略赚" | "很赚"} FeelingWord
 */

/**
 * 感受词计算结果。
 *
 * @typedef {Object} PerceivedFeelingResult
 * @property {FeelingWord} playerFeeling      玩家视角感受词（你觉得 XX）
 * @property {FeelingWord} merchantFeeling    商人视角感受词（[交易对象] 觉得 XX）
 * @property {TradeValueSummary} valueSummary 内部统一价值的聚合结果
 */

/**
 * 感受词计算接口，对应 basic.md 9.7.2。
 *
 * 实现方负责：
 * - 从会话 pending 中构造 Give_player / Get_player 集合
 * - 使用 ValueCalculator 计算 value_i 并汇总为 V_*
 * - 根据比值 r_player / r_merchant 映射到 FeelingWord
 *
 * UI 仅在每次 pending 变化时调用，获得新的感受词与汇总数值。
 *
 * @callback FeelingCalculator
 * @param {TradeContext} context          当前交易上下文
 * @returns {PerceivedFeelingResult}
 */

/**
 * 商人态度/性格档位的粗粒度枚举。
 * 实际枚举值应与商人模板中的配置对齐。
 *
 * @typedef {"cold" | "cautious" | "neutral" | "friendly" | "warm"} MerchantAttitude
 */

/**
 * 商人类型，对应 basic.md 9.2.1 中的摊贩 / 店主 / 旅行商队。
 *
 * @typedef {"stall" | "shopkeeper" | "caravan"} MerchantType
 */

/**
 * 单个商人的交易相关静态/半静态信息。
 * 该结构与后端商人模板字段对齐，但只保留交易与感受相关部分。
 *
 * 对齐文档：
 * - basic.md 9.2（场景与资金池）
 * - basic.md 9.7.1（merchant_bias, preferred_tags, disliked_tags）
 * - items_template_and_style.md 货币 accept_code
 *
 * @typedef {Object} MerchantProfile
 * @property {string} id                       商人唯一 ID
 * @property {string} name                     商人显示名
 * @property {MerchantType} merchantType       商人类型（摊贩/店主/旅行商队）
 * @property {MerchantAttitude} attitude       当前对玩家的态度档位
 * @property {number} priceBias                商人整体偏贵/偏便宜系数 merchant_bias
 * @property {string[]} preferredTags          偏好物品标签集合
 * @property {string[]} dislikedTags           厌恶物品标签集合
 * @property {string[]} acceptedCurrencyCodes  支持的货币短码列表（对应 currency_base.csv 中 accept_code）
 * @property {number} baseFundsPool            商人模板中的资金池上限（未乘场景系数前）
 * @property {number} currentFundsPool         当前场景下可用于收购的剩余资金池数值
 */

/**
 * 交易上下文对象，对应 basic.md 9.2.1 中「交易上下文的含义」以及
 * 计划文档中的 TradeContext 设计。
 *
 * UI 在每次打开交易界面时构建一个新的 TradeContext 实例，
 * 并在会话内维护其中的 pendingGive / pendingGet 聚合状态。
 *
 * @typedef {Object} TradeContext
 * @property {TradeSceneType} sceneType        当前交易场景类型（Market / Shop / Exchange / Travel）
 * @property {string|null} locationId          交易发生的地点 ID；Travel 场景可为空
 * @property {MerchantProfile} merchant        当前唯一交易对象（界面内不切换商人）
 * @property {TradeInventoryRow[]} playerInventory    玩家可交易物品列表
 * @property {TradeInventoryRow[]} merchantInventory  商人可交易物品列表
 * @property {string[]} acceptedCurrencies     从商人配置得出的货币 accept_code 列表
 * @property {Object.<string, PendingLine>} pendingGivePlayer   玩家本次会话计划给出的物品聚合（键为 itemId）
 * @property {Object.<string, PendingLine>} pendingGetPlayer    玩家本次会话计划拿取的物品聚合（键为 itemId）
 * @property {Object.<string, PendingLine>} pendingGiveMerchant 商人视角本次会话计划给出的物品聚合（通常等同于 pendingGetPlayer）
 * @property {Object.<string, PendingLine>} pendingGetMerchant  商人视角本次会话计划拿取的物品聚合（通常等同于 pendingGivePlayer）
 * @property {ValueCalculator} valueCalculator                计算 value_i 的接口实现
 * @property {FeelingCalculator} feelingCalculator            计算感受词的接口实现
 */

/**
 * 创建一个空的交易上下文骨架，用于在打开交易界面时初始化。
 *
 * @param {TradeSceneType} sceneType
 * @param {string|null} locationId
 * @param {MerchantProfile} merchant
 * @param {TradeInventoryRow[]} playerInventory
 * @param {TradeInventoryRow[]} merchantInventory
 * @param {ValueCalculator} valueCalculator
 * @param {FeelingCalculator} feelingCalculator
 * @returns {TradeContext}
 */
export function createTradeContext(
  sceneType,
  locationId,
  merchant,
  playerInventory,
  merchantInventory,
  valueCalculator,
  feelingCalculator
) {
  return {
    sceneType,
    locationId: locationId || null,
    merchant,
    playerInventory,
    merchantInventory,
    acceptedCurrencies: merchant.acceptedCurrencyCodes.slice(),
    pendingGivePlayer: {},
    pendingGetPlayer: {},
    pendingGiveMerchant: {},
    pendingGetMerchant: {},
    valueCalculator,
    feelingCalculator,
  };
}

/**
 * 在给定库存行中查找指定 itemId 的行。
 *
 * @param {TradeInventoryRow[]} inventory
 * @param {string} itemId
 * @returns {TradeInventoryRow|null}
 */
function findInventoryRow(inventory, itemId) {
  for (let i = 0; i < inventory.length; i += 1) {
    if (inventory[i].item && inventory[i].item.itemId === itemId) {
      return inventory[i];
    }
  }
  return null;
}

/**
 * 在 PendingLine 映射中安全地增加/减少数量。
 *
 * 对齐 trade_ui_layout.md：
 * - 数量为 0 时「隐藏但不删除」，以便后续从 0 再次增加时复用同一行
 * - 仅在「成交」或「关闭交易窗口」时才应真正删除（demo 中由更上层负责清空）
 *
 * @param {Object.<string, PendingLine>} pendingMap
 * @param {string} itemId
 * @param {number} delta
 */
function updatePendingMap(pendingMap, itemId, delta) {
  if (!delta) return;

  const existing = pendingMap[itemId];
  const nextCount = (existing ? existing.count : 0) + delta;

  pendingMap[itemId] = {
    itemId,
    count: Math.max(0, nextCount | 0),
  };
}

/**
 * 调整一行的 pendingQuantity 数值（仅 UI 层使用的工具函数）。
 *
 * 该函数实现「步进区逻辑」中 -10/-1/N/+1/+10 对数量的夹紧规则：
 * - 结果始终位于 [0, availableCount] 区间
 *
 * @param {number} pendingQuantity 当前该行准备给/要的数量
 * @param {number} availableCount  当前该行可用于交易的库存数量
 * @param {number} delta           本次步进按钮带来的增量（例如 -10、-1、+1、+10）
 * @returns {number}               更新后的 pendingQuantity
 */
export function stepPendingQuantity(pendingQuantity, availableCount, delta) {
  const safeAvailable = Math.max(0, availableCount | 0);
  const base = Math.max(0, pendingQuantity | 0);
  const next = base + (delta | 0);
  if (next <= 0) return 0;
  if (next >= safeAvailable) return safeAvailable;
  return next;
}

/**
 * 单行「给 / 要」按钮的核心逻辑。
 *
 * 该函数只负责：
 * - 在给定方向上从一侧库存暂扣数量（availableCount）
 * - 更新 TradeContext 内四个 pending 聚合映射
 * - 保证 pending 行在双方列表中对称更新（玩家 Give ↔ 商人 Get；玩家 Get ↔ 商人 Give）
 *
 * 不负责：
 * - 具体 Canvas 重绘
 * - 感受词重算（由外层在调用后统一触发 feelingCalculator）
 *
 * @param {TradeContext} context       当前交易上下文（就地修改并返回同一引用）
 * @param {"player"|"merchant"} actor  触发操作的一侧（当前仅会使用 "player"）
 * @param {"give"|"get"} intent        本行操作意图：
 *   - "give": actor 试图把该物品给对方
 *   - "get":  actor 试图从对方拿该物品
 * @param {string} itemId              物品 ID
 * @param {number} quantity            本次操作的数量（已由步进区确定，>=0）
 * @returns {TradeContext}             传入的同一 context（便于链式调用）
 */
export function applyRowTradeAction(context, actor, intent, itemId, quantity) {
  const qty = Math.max(0, quantity | 0);
  if (!qty) return context;

  const isPlayer = actor === "player";
  const isGive = intent === "give";

  // 确定「出货侧」与「收货侧」库存
  const sourceInventory =
    isPlayer === isGive ? context.playerInventory : context.merchantInventory;
  const sourceRow = findInventoryRow(sourceInventory, itemId);
  if (!sourceRow || sourceRow.availableCount <= 0) {
    return context;
  }

  const transferable = Math.min(sourceRow.availableCount, qty);
  if (transferable <= 0) {
    return context;
  }

  // 从出货侧暂时扣减可用数量（会话内缓存）
  sourceRow.availableCount -= transferable;

  // 玩家与商人视角的 pending 聚合同时更新。
  if (isPlayer && isGive) {
    // 玩家给出 → 玩家 Give / 商人 Get
    updatePendingMap(context.pendingGivePlayer, itemId, transferable);
    updatePendingMap(context.pendingGetMerchant, itemId, transferable);
  } else if (isPlayer && !isGive) {
    // 玩家拿取 → 玩家 Get / 商人 Give
    updatePendingMap(context.pendingGetPlayer, itemId, transferable);
    updatePendingMap(context.pendingGiveMerchant, itemId, transferable);
  } else if (!isPlayer && isGive) {
    // 商人给出 → 商人 Give / 玩家 Get
    updatePendingMap(context.pendingGiveMerchant, itemId, transferable);
    updatePendingMap(context.pendingGetPlayer, itemId, transferable);
  } else {
    // 商人拿取 → 商人 Get / 玩家 Give
    updatePendingMap(context.pendingGetMerchant, itemId, transferable);
    updatePendingMap(context.pendingGivePlayer, itemId, transferable);
  }

  return context;
}


