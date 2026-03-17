/**
 * 交易 Canvas UI 交互与重绘框架。
 *
 * 对齐规划文档：
 * - canvas-trade-ui-design.plan.md「三、列表与单行交互逻辑」
 * - canvas-trade-ui-design.plan.md「四、感受行与结算按钮行为」
 * - canvas-trade-ui-design.plan.md「六、Canvas 交互框架与事件流」
 *
 * 本文件聚焦于：
 * - 统一维护 Trade UI 的运行时状态（TradeUIState）
 * - 将鼠标事件分发给 UI 元素（按钮、列表区域等）
 * - 在「给 / 要」等操作后触发感受词重算
 * - 在点击「成交」按钮时，调用外部结算接口 tryCommitTrade
 *
 * 不负责：
 * - 具体的 Canvas 绘制细节（由外部 renderer 提供）
 * - 背包/商人库存的真实数据持久化（由逻辑层 / 后端实现）
 */

import { computePhysicalTradeLayout } from "./trade_layout.js";
import { applyRowTradeAction, stepPendingQuantity } from "./trade_context.js";

/**
 * UI 元素的基础描述，用于命中检测与事件分发。
 *
 * @typedef {Object} UIElement
 * @property {string} id                         稳定的元素 ID（如 "dealButton"、"playerRow:idx"）
 * @property {{ x: number, y: number, width: number, height: number }} bounds 物理像素坐标系下的矩形
 * @property {(state: TradeUIState, ev: TradePointerEvent) => void} [onClick]   点击回调
 * @property {(state: TradeUIState, ev: TradePointerEvent) => void} [onMouseMove]
 * @property {(state: TradeUIState, ev: TradeWheelEvent) => void} [onWheel]
 */

/**
 * 鼠标事件在 Trade UI 中的统一封装。
 *
 * @typedef {Object} TradePointerEvent
 * @property {"mousedown"|"mouseup"|"mousemove"|"click"} type
 * @property {number} x         相对 Canvas 的像素坐标（已扣除 canvas.getBoundingClientRect 的 left/top）
 * @property {number} y
 * @property {MouseEvent} raw   原始浏览器事件
 */

/**
 * 滚轮事件封装。
 *
 * @typedef {Object} TradeWheelEvent
 * @property {"wheel"} type
 * @property {number} x
 * @property {number} y
 * @property {number} deltaY
 * @property {WheelEvent} raw
 */

/**
 * 结算结果接口定义。
 *
 * 该接口由逻辑层实现，负责：
 * - 按 basic.md 9.2.2 校验单物品/周期限额
 * - 按 basic.md 9.2.3 校验并更新资金池，将超额部分换算为商誉
 * - 在成功时真正修改玩家与商人库存（包括资金池字段）
 *
 * UI 层只关心：
 * - 这次是否真正结算（committed）
 * - 是否需要玩家二次确认（needConfirm）
 * - 若需要确认，如何在玩家选择「仍要贩卖」后重试
 * - 文案提示所需的错误码或消息
 *
 * @typedef {Object} CommitTradeResult
 * @property {boolean} committed          是否已经完成结算并更新库存
 * @property {boolean} needConfirm        是否需要弹出确认对话框（如资金池不足但允许超额换商誉）
 * @property {string} [errorCode]         非空时表示失败原因（如 "LIMIT_REACHED"、"FUNDS_EXHAUSTED"）
 * @property {string} [errorMessage]      供 UI 展示的错误提示（可选）
 */

/**
 * 结算接口定义。
 *
 * @callback TryCommitTrade
 * @param {import("./trade_context.js").TradeContext} context  当前交易上下文（含 pendingGive* / pendingGet*）
 * @param {Object} options
 * @param {boolean} options.forceCommit  当 needConfirm=true 且玩家选择「仍要贩卖」时，应以 forceCommit=true 重试
 * @returns {CommitTradeResult}
 */

/**
 * Trade UI 对外需要的渲染与回调接口。
 *
 * @typedef {Object} TradeUIRenderer
 * @property {(state: TradeUIState) => void} drawAll
 *   - 完整重绘整个交易界面（标题栏、双列表、感受行、按钮等）
 *   - 在任何状态变化后由本模块调用
 * @property {() => void} [showCommitConfirmDialog]
 *   - 当 tryCommitTrade 返回 needConfirm=true 时，由本模块调用以展示模态确认框
 *   - 实现方负责在玩家点击「仍要贩卖」或「取消」时，再次调用本模块提供的 confirm / cancel 回调
 * @property {(message: string) => void} [showTransientMessage]
 *   - 显示一次性提示（如限额已达上限等），具体展现形式由实现方决定
 * @property {() => void} [onCloseRequested]
 *   - 当点击关闭按钮或其他逻辑要求关闭 UI 时调用
 */

/**
 * Trade UI 运行时状态。
 *
 * @typedef {Object} TradeUIState
 * @property {HTMLCanvasElement} canvas
 * @property {CanvasRenderingContext2D} ctx
 * @property {import("./trade_context.js").TradeContext} context
 * @property {ReturnType<typeof computePhysicalTradeLayout>} layout
 * @property {UIElement[]} uiElements
 * @property {TradeUIRenderer} renderer
 * @property {TryCommitTrade} tryCommitTrade
 * @property {import("./trade_context.js").PerceivedFeelingResult|null} lastFeelingResult
 * @property {boolean} needsRedraw
 * @property {string|null} hoverElementId
 * @property {string|null} pressedElementId
 * @property {HTMLInputElement|null} stepInputEl
 * @property {{ side: "player"|"merchant", itemId: string, originalValue: number } | null} stepInputSession
 * @property {{ isPointerDown: boolean, lastPointerX: number, lastPointerY: number }} pointerState
 * @property {{ player: number, merchant: number }} scrollY
 * @property {{ player: Object.<string, number>, merchant: Object.<string, number> }} stepN
 */

/**
 * 创建 Trade UI 运行时状态，并完成初始布局与感受词计算。
 *
 * @param {HTMLCanvasElement} canvas
 * @param {import("./trade_context.js").TradeContext} context
 * @param {Object} deps
 * @param {TradeUIRenderer} deps.renderer
 * @param {TryCommitTrade} deps.tryCommitTrade
 * @returns {TradeUIState}
 */
export function createTradeUIState(canvas, context, { renderer, tryCommitTrade }) {
  if (!canvas) {
    throw new Error("createTradeUIState: canvas is required.");
  }
  const ctx = /** @type {CanvasRenderingContext2D|null} */ (canvas.getContext("2d"));
  if (!ctx) {
    throw new Error("createTradeUIState: 2d context is required.");
  }

  const layout = computePhysicalTradeLayout(canvas.width, canvas.height);

  /** @type {TradeUIState} */
  const state = {
    canvas,
    ctx,
    context,
    layout,
    uiElements: [],
    renderer,
    tryCommitTrade,
    lastFeelingResult: null,
    needsRedraw: true,
    hoverElementId: null,
    pressedElementId: null,
    stepInputEl:
      typeof document !== "undefined"
        ? /** @type {HTMLInputElement|null} */ (document.getElementById("trade-step-input"))
        : null,
    stepInputSession: null,
    pointerState: {
      isPointerDown: false,
      lastPointerX: 0,
      lastPointerY: 0,
    },
    scrollY: {
      player: 0,
      merchant: 0,
    },
    stepN: {
      player: {},
      merchant: {},
    },
  };

  // 初始构建 UI 元素（静态按钮 + 列表滚动区 + 行内按钮）
  rebuildAllUIElements(state);

  // 初次计算感受词（通常在没有 pending 的情况下会返回「可以」等中性值）
  recomputeFeelings(state);

  // 立即绘制一帧
  renderer.drawAll(state);
  state.needsRedraw = false;

  // 绑定鼠标事件
  attachCanvasEventListeners(state);
  attachStepInputEventListeners(state);

  return state;
}

/**
 * 外部在 canvas 尺寸变化后可调用该函数刷新布局与命中框。
 *
 * @param {TradeUIState} state
 */
export function refreshTradeUILayout(state) {
  state.layout = computePhysicalTradeLayout(state.canvas.width, state.canvas.height);
  rebuildAllUIElements(state);
  requestFullRedraw(state);
}

/**
 * 根据当前布局重建静态 + 动态 UI 元素：
 * - 关闭按钮 / 成交按钮
 * - 左右列表滚动区域（wheel）
 * - 行内步进与动作按钮（click）
 *
 * @param {TradeUIState} state
 */
function rebuildAllUIElements(state) {
  const { layout, context } = state;

  /** @type {UIElement[]} */
  const elements = [];

  // 关闭按钮
  elements.push({
    id: "closeButton",
    bounds: layout.bounds.closeButton,
    onClick: (s) => {
      if (s.renderer.onCloseRequested) {
        s.renderer.onCloseRequested();
      }
    },
  });

  // 成交按钮
  elements.push({
    id: "dealButton",
    bounds: layout.bounds.dealButton,
    onClick: (s) => {
      handleDealButtonClick(s);
    },
  });

  // 左右列表滚动区域
  elements.push({
    id: "playerListScroll",
    bounds: layout.bounds.playerList,
    onWheel: (s, ev) => {
      applyListWheelScroll(s, "player", ev.deltaY);
    },
  });
  elements.push({
    id: "merchantListScroll",
    bounds: layout.bounds.merchantList,
    onWheel: (s, ev) => {
      applyListWheelScroll(s, "merchant", ev.deltaY);
    },
  });

  // 动态行按钮：根据当前 inventory + pending 构造表格行，然后生成命中框
  const model = buildTradeTableModel(context);
  appendRowUIElements(elements, state, model);

  state.uiElements = elements;
}

// 行布局与列表内边距：作为“唯一真源”，渲染层与交互层共享，避免错位。
export const ROW_HEIGHT = 39;
export const LIST_INSET_Y = 12; // ~= 18px 字体的 2/3
export const LIST_TEXT_PAD_X = 12;
export const ROW_PAD_X = 14;

/**
 * @typedef {Object} TradeRowModel
 * @property {string} itemId
 * @property {string} displayName
 * @property {number} availableCount
 * @property {number} pendingCount
 * @property {boolean} underline
 */

/**
 * @typedef {Object} TradeTableModel
 * @property {TradeRowModel[]} playerRows
 * @property {TradeRowModel[]} merchantRows
 * @property {number} totalRows
 */

/**
 * 构造双列表的“展示模型”：
 * - 行数对齐：totalRows = max(左物品数,右物品数)，不足侧补空行
 * - 待处理行：点击给/要后，在对方列表中展示 pending（同物品仅一行、数量为 0 隐藏）
 *
 * 约定：
 * - 左侧列表的 pending 来自 context.pendingGetPlayer（玩家“要到手”的东西）
 * - 右侧列表的 pending 来自 context.pendingGivePlayer（玩家“给出去”的东西）
 *
 * @param {import("./trade_context.js").TradeContext} context
 * @returns {TradeTableModel}
 */
function buildTradeTableModel(context) {
  const toBaseRowModel = (row) => ({
    itemId: row.item.itemId,
    displayName: row.item.displayName,
    availableCount: row.availableCount | 0,
    pendingCount: 0,
    underline: false,
  });

  /** @type {Object.<string, TradeRowModel>} */
  const playerMap = {};
  /** @type {Object.<string, TradeRowModel>} */
  const merchantMap = {};

  for (const row of context.playerInventory) {
    if (!row || !row.item) continue;
    playerMap[row.item.itemId] = toBaseRowModel(row);
  }
  for (const row of context.merchantInventory) {
    if (!row || !row.item) continue;
    merchantMap[row.item.itemId] = toBaseRowModel(row);
  }

  // pending 行：数量为 0 时隐藏但保留；这里直接不加入 rows（达到“隐藏”效果）
  for (const itemId in context.pendingGetPlayer) {
    const p = context.pendingGetPlayer[itemId];
    const cnt = (p?.count || 0) | 0;
    if (cnt <= 0) continue;
    if (!playerMap[itemId]) {
      playerMap[itemId] = {
        itemId,
        displayName: itemId,
        availableCount: 0,
        pendingCount: cnt,
        underline: true,
      };
    } else {
      playerMap[itemId].pendingCount = cnt;
      playerMap[itemId].underline = true;
    }
  }
  for (const itemId in context.pendingGivePlayer) {
    const p = context.pendingGivePlayer[itemId];
    const cnt = (p?.count || 0) | 0;
    if (cnt <= 0) continue;
    if (!merchantMap[itemId]) {
      merchantMap[itemId] = {
        itemId,
        displayName: itemId,
        availableCount: 0,
        pendingCount: cnt,
        underline: true,
      };
    } else {
      merchantMap[itemId].pendingCount = cnt;
      merchantMap[itemId].underline = true;
    }
  }

  const playerRows = Object.values(playerMap);
  const merchantRows = Object.values(merchantMap);

  // 稳定排序：按 displayName（demo 足够）
  playerRows.sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-Hans-CN"));
  merchantRows.sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-Hans-CN"));

  const totalRows = Math.max(playerRows.length, merchantRows.length);
  return { playerRows, merchantRows, totalRows };
}

/**
 * 将滚轮输入转为列表滚动（独立滚动）。
 *
 * @param {TradeUIState} state
 * @param {"player"|"merchant"} side
 * @param {number} deltaY
 */
function applyListWheelScroll(state, side, deltaY) {
  const model = buildTradeTableModel(state.context);
  const total = model.totalRows;
  const listBounds =
    side === "player" ? state.layout.bounds.playerList : state.layout.bounds.merchantList;
  const viewportH = Math.max(0, listBounds.height - LIST_INSET_Y * 2);
  const maxScroll = Math.max(0, total * ROW_HEIGHT - viewportH);
  const next = (state.scrollY[side] || 0) + deltaY;
  state.scrollY[side] = clamp(next, 0, maxScroll);
  rebuildAllUIElements(state);
  requestFullRedraw(state);
}

function clamp(v, min, max) {
  if (v <= min) return min;
  if (v >= max) return max;
  return v;
}

/**
 * 生成双列表行内按钮的命中框。
 *
 * @param {UIElement[]} elements
 * @param {TradeUIState} state
 * @param {TradeTableModel} model
 */
function appendRowUIElements(elements, state, model) {
  const { bounds } = state.layout;
  const { totalRows, playerRows, merchantRows } = model;

  const appendSide = (side) => {
    const isPlayer = side === "player";
    const listRect = isPlayer ? bounds.playerList : bounds.merchantList;
    const rows = isPlayer ? playerRows : merchantRows;
    const scrollY = state.scrollY[side] || 0;

    const contentTop = listRect.y + LIST_INSET_Y;
    for (let i = 0; i < totalRows; i += 1) {
      const row = rows[i] || null;
      const rowY = contentTop + i * ROW_HEIGHT - scrollY;

      // 不在可视区域内的行不生成按钮命中框
      if (rowY + ROW_HEIGHT < listRect.y + 1 || rowY > listRect.y + listRect.height - 1)
        continue;
      if (!row) continue; // 补空行无按钮

      // 按钮布局：右侧从后往前排，以便对齐
      const right = listRect.x + listRect.width - ROW_PAD_X;
      const btnH = 26;
      const btnY = rowY + Math.floor((ROW_HEIGHT - btnH) / 2);
      const pad = 4;

      const mkBtn = (id, x, w, onClick) => {
        elements.push({
          id,
          bounds: { x, y: btnY, width: w, height: btnH },
          onClick,
        });
      };

      // 动作按钮：两按钮间 1 个半角空格视觉间距（这里用 9px）
      const actionGap = 9;
      const actionW = 92;
      const actionW2 = 92;

      const btn2X = right - actionW2;
      const btn1X = btn2X - actionGap - actionW;

      const itemId = row.itemId;

      // 步进区：[-10][-1][N][+1][+10]
      const stepW = 44;
      const stepGap = 6;
      const stepN_W = 62; // N 输入槽更宽，形成差异化
      const stepRight = btn1X - 18;
      const step5X = stepRight - stepW;
      const step4X = step5X - stepGap - stepW;
      const step3X = step4X - stepGap - stepN_W;
      const step2X = step3X - stepGap - stepW;
      const step1X = step2X - stepGap - stepW;

      const availableCount = findAvailableCountForSide(state.context, side, itemId);

      mkBtn(`${side}:step:-10:${itemId}`, step1X, stepW, (s) => {
        const avail = findAvailableCountForSide(s.context, side, itemId);
        setStepN(
          s,
          side,
          itemId,
          stepPendingQuantity(getStepN(s, side, itemId, avail), avail, -10)
        );
      });
      mkBtn(`${side}:step:-1:${itemId}`, step2X, stepW, (s) => {
        const avail = findAvailableCountForSide(s.context, side, itemId);
        setStepN(
          s,
          side,
          itemId,
          stepPendingQuantity(getStepN(s, side, itemId, avail), avail, -1)
        );
      });
      elements.push({
        id: `${side}:step:N:${itemId}`,
        bounds: { x: step3X, y: btnY, width: stepN_W, height: btnH },
        onClick: (s) => {
          const avail = findAvailableCountForSide(s.context, side, itemId);
          openStepNInput(
            s,
            side,
            itemId,
            { x: step3X, y: btnY, width: stepN_W, height: btnH },
            avail
          );
        },
      });
      mkBtn(`${side}:step:+1:${itemId}`, step4X, stepW, (s) => {
        const avail = findAvailableCountForSide(s.context, side, itemId);
        setStepN(
          s,
          side,
          itemId,
          stepPendingQuantity(getStepN(s, side, itemId, avail), avail, +1)
        );
      });
      mkBtn(`${side}:step:+10:${itemId}`, step5X, stepW, (s) => {
        const avail = findAvailableCountForSide(s.context, side, itemId);
        setStepN(
          s,
          side,
          itemId,
          stepPendingQuantity(getStepN(s, side, itemId, avail), avail, +10)
        );
      });

      if (isPlayer) {
        // 左侧动作：[给N个] [全都给]
        mkBtn(`${side}:action:giveN:${itemId}`, btn1X, actionW, (s) => {
          const avail = findAvailableCountForSide(s.context, "player", itemId);
          const n = clamp(getStepN(s, "player", itemId, avail), 0, avail);
          applyRowActionAndRefresh(s, "player", "give", itemId, n);
          rebuildAllUIElements(s);
        });
        mkBtn(`${side}:action:giveAll:${itemId}`, btn2X, actionW2, (s) => {
          const avail = findAvailableCountForSide(s.context, "player", itemId);
          applyRowActionAndRefresh(s, "player", "give", itemId, avail);
          rebuildAllUIElements(s);
        });
      } else {
        // 右侧动作：[要N个] [全都要]
        mkBtn(`${side}:action:getN:${itemId}`, btn1X, actionW, (s) => {
          const avail = findAvailableCountForSide(s.context, "merchant", itemId);
          const n = clamp(getStepN(s, "merchant", itemId, avail), 0, avail);
          applyRowActionAndRefresh(s, "player", "get", itemId, n);
          rebuildAllUIElements(s);
        });
        mkBtn(`${side}:action:getAll:${itemId}`, btn2X, actionW2, (s) => {
          const avail = findAvailableCountForSide(s.context, "merchant", itemId);
          applyRowActionAndRefresh(s, "player", "get", itemId, avail);
          rebuildAllUIElements(s);
        });
      }

      // 避免 unused 警告（未来会用于绘制 N 与状态）
      void pad;
      void availableCount;
    }
  };

  appendSide("player");
  appendSide("merchant");
}

/**
 * @param {import("./trade_context.js").TradeContext} context
 * @param {"player"|"merchant"} side
 * @param {string} itemId
 */
function findAvailableCountForSide(context, side, itemId) {
  const inv = side === "player" ? context.playerInventory : context.merchantInventory;
  for (const row of inv) {
    if (row?.item?.itemId === itemId) return Math.max(0, row.availableCount | 0);
  }
  return 0;
}

function getStepN(state, side, itemId, availableCount) {
  const map = state.stepN[side];
  const existing = map[itemId];
  const base = typeof existing === "number" ? (existing | 0) : 1;
  return clamp(base, 0, Math.max(0, availableCount | 0));
}

function setStepN(state, side, itemId, next) {
  state.stepN[side][itemId] = next | 0;
  rebuildAllUIElements(state);
  requestFullRedraw(state);
}

/**
 * 处理成交按钮点击事件：
 * - 保证只有在点击「成交」时才会尝试修改真实库存
 * - 调用 tryCommitTrade 与资金池/限额规则对接
 * - 根据 needConfirm 结果决定是否弹出确认对话框
 *
 * @param {TradeUIState} state
 */
function handleDealButtonClick(state) {
  const { context, tryCommitTrade } = state;

  // 第一次尝试结算（forceCommit=false）
  const result = tryCommitTrade(context, { forceCommit: false });

  if (result.needConfirm) {
    // 资金池不足但允许以商誉补足等情况，交由 UI 弹出确认框
    if (state.renderer.showCommitConfirmDialog) {
      state.renderer.showCommitConfirmDialog();
    }
    // 外部在用户选择「仍要贩卖」时应再次调用 confirmCurrentTrade(state)
    return;
  }

  if (!result.committed) {
    // 失败但无需确认，展示一次性提示
    if (result.errorMessage && state.renderer.showTransientMessage) {
      state.renderer.showTransientMessage(result.errorMessage);
    }
    return;
  }

  // 成功结算：pending 聚合应在逻辑层已被清空，并刷新库存
  // 重新计算感受词，并整屏重绘
  recomputeFeelings(state);
  rebuildAllUIElements(state);
  requestFullRedraw(state);
}

/**
 * 外部在确认对话框中点击「仍要贩卖」时，可调用该函数强制执行结算。
 *
 * @param {TradeUIState} state
 */
export function confirmCurrentTrade(state) {
  const { context, tryCommitTrade } = state;
  const result = tryCommitTrade(context, { forceCommit: true });

  if (!result.committed) {
    if (result.errorMessage && state.renderer.showTransientMessage) {
      state.renderer.showTransientMessage(result.errorMessage);
    }
    return;
  }

  recomputeFeelings(state);
  rebuildAllUIElements(state);
  requestFullRedraw(state);
}

/**
 * 在任何 pendingGive / pendingGet 发生变更后，重新计算感受词。
 *
 * @param {TradeUIState} state
 */
function recomputeFeelings(state) {
  if (!state.context.feelingCalculator) {
    state.lastFeelingResult = null;
    return;
  }
  state.lastFeelingResult = state.context.feelingCalculator(state.context);
}

/**
 * 供外部在列表行绘制逻辑中调用的帮手：
 * - 执行单行「给 / 要」动作（会话内暂扣数量并更新 pending 聚合）
 * - 重新计算感受词
 * - 请求一次整屏重绘
 *
 * 该函数确保：只有在会话内 pending 变化时会影响感受词与界面展示，
 * 真实库存只在点击「成交」并成功结算后由 tryCommitTrade 修改。
 *
 * @param {TradeUIState} state
 * @param {"player"|"merchant"} actor
 * @param {"give"|"get"} intent
 * @param {string} itemId
 * @param {number} quantity
 */
export function applyRowActionAndRefresh(state, actor, intent, itemId, quantity) {
  applyRowTradeAction(state.context, actor, intent, itemId, quantity);
  recomputeFeelings(state);
  requestFullRedraw(state);
}

/**
 * 标记需要整屏重绘，并立即调用 renderer.drawAll。
 *
 * @param {TradeUIState} state
 */
function requestFullRedraw(state) {
  state.needsRedraw = true;
  state.renderer.drawAll(state);
  state.needsRedraw = false;
}

/**
 * 仅在 hover/pressed 状态变化时触发重绘，避免 mousemove 频繁全量重绘。
 *
 * @param {TradeUIState} state
 * @param {string|null} nextHoverId
 */
function setHoverElementId(state, nextHoverId) {
  const curr = state.hoverElementId || null;
  const next = nextHoverId || null;
  if (curr === next) return;
  state.hoverElementId = next;
  requestFullRedraw(state);
}

/**
 * @param {TradeUIState} state
 * @param {string|null} nextPressedId
 */
function setPressedElementId(state, nextPressedId) {
  const curr = state.pressedElementId || null;
  const next = nextPressedId || null;
  if (curr === next) return;
  state.pressedElementId = next;
  requestFullRedraw(state);
}

/**
 * 将浏览器鼠标事件转换为 TradePointerEvent / TradeWheelEvent。
 *
 * @param {TradeUIState} state
 * @param {MouseEvent | WheelEvent} ev
 * @param {"mousedown"|"mouseup"|"mousemove"|"click"|"wheel"} type
 * @returns {TradePointerEvent | TradeWheelEvent}
 */
function normalizePointerEvent(state, ev, type) {
  const rect = state.canvas.getBoundingClientRect();
  // 将 CSS 像素坐标映射到 Canvas 实际像素坐标（处理 devicePixelRatio / CSS 缩放）
  const scaleX = rect.width > 0 ? state.canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? state.canvas.height / rect.height : 1;
  const x = (ev.clientX - rect.left) * scaleX;
  const y = (ev.clientY - rect.top) * scaleY;

  if (type === "wheel") {
    const wheelEv = /** @type {WheelEvent} */ (ev);
    return {
      type: "wheel",
      x,
      y,
      deltaY: wheelEv.deltaY,
      raw: wheelEv,
    };
  }

  return {
    type,
    x,
    y,
    raw: /** @type {MouseEvent} */ (ev),
  };
}

/**
 * 根据坐标查找第一个命中的 UIElement。
 *
 * @param {TradeUIState} state
 * @param {number} x
 * @param {number} y
 * @returns {UIElement|null}
 */
function hitTest(state, x, y) {
  // 简单顺序查找；如需覆盖关系，可在 uiElements 中按 zIndex 预排序
  for (let i = 0; i < state.uiElements.length; i += 1) {
    const el = state.uiElements[i];
    const b = el.bounds;
    if (
      x >= b.x &&
      x <= b.x + b.width &&
      y >= b.y &&
      y <= b.y + b.height
    ) {
      return el;
    }
  }
  return null;
}

/**
 * 分发点击相关事件。
 *
 * @param {TradeUIState} state
 * @param {TradePointerEvent} ev
 */
function dispatchPointerEvent(state, ev) {
  const target = hitTest(state, ev.x, ev.y);
  if (!target) return;

  if (ev.type === "click" && target.onClick) {
    target.onClick(state, ev);
  } else if (target.onMouseMove) {
    target.onMouseMove(state, ev);
  }
}

/**
 * 分发滚轮事件，用于列表滚动等。
 *
 * @param {TradeUIState} state
 * @param {TradeWheelEvent} ev
 */
function dispatchWheelEvent(state, ev) {
  const target = hitTest(state, ev.x, ev.y);
  if (!target || !target.onWheel) return;
  target.onWheel(state, ev);
}

/**
 * 为 canvas 绑定鼠标事件监听，并与 UI 元素命中检测绑定。
 *
 * @param {TradeUIState} state
 */
function attachCanvasEventListeners(state) {
  const canvas = state.canvas;

  const handleMouseDown = (ev) => {
    if (isStepInputVisible(state)) return;
    const pev = /** @type {TradePointerEvent} */ (
      normalizePointerEvent(state, ev, "mousedown")
    );
    state.pointerState.isPointerDown = true;
    state.pointerState.lastPointerX = pev.x;
    state.pointerState.lastPointerY = pev.y;

    const target = hitTest(state, pev.x, pev.y);
    setPressedElementId(state, target ? target.id : null);
  };

  const handleMouseUp = (ev) => {
    if (isStepInputVisible(state)) return;
    const pev = /** @type {TradePointerEvent} */ (
      normalizePointerEvent(state, ev, "mouseup")
    );
    state.pointerState.isPointerDown = false;
    setPressedElementId(state, null);
    dispatchPointerEvent(state, pev);

    // 将 mouseup 视为一次 click，方便按钮实现
    const clickEv = /** @type {TradePointerEvent} */ (
      normalizePointerEvent(state, ev, "click")
    );
    dispatchPointerEvent(state, clickEv);
  };

  const handleMouseMove = (ev) => {
    if (isStepInputVisible(state)) return;
    const pev = /** @type {TradePointerEvent} */ (
      normalizePointerEvent(state, ev, "mousemove")
    );
    state.pointerState.lastPointerX = pev.x;
    state.pointerState.lastPointerY = pev.y;

    const target = hitTest(state, pev.x, pev.y);
    setHoverElementId(state, target ? target.id : null);
    dispatchPointerEvent(state, pev);
  };

  const handleWheel = (ev) => {
    if (isStepInputVisible(state)) return;
    const wev = /** @type {TradeWheelEvent} */ (
      normalizePointerEvent(state, ev, "wheel")
    );
    dispatchWheelEvent(state, wev);
  };

  const handleMouseLeave = () => {
    state.pointerState.isPointerDown = false;
    setPressedElementId(state, null);
    setHoverElementId(state, null);
  };

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseleave", handleMouseLeave);
  canvas.addEventListener("wheel", handleWheel, { passive: true });
}

function isStepInputVisible(state) {
  const el = state.stepInputEl;
  return !!el && el.style.display !== "none";
}

function attachStepInputEventListeners(state) {
  const input = state.stepInputEl;
  if (!input) return;

  // 输入过滤：仅允许数字（允许为空）；其他字符实时剔除
  input.addEventListener("input", () => {
    const raw = String(input.value || "");
    // 仅保留 0-9
    const filtered = raw.replace(/[^\d]/g, "");
    if (filtered !== raw) {
      const end = input.selectionEnd || 0;
      const delta = raw.length - filtered.length;
      input.value = filtered;
      // 尽量维持光标位置
      const nextPos = Math.max(0, end - delta);
      try {
        input.setSelectionRange(nextPos, nextPos);
      } catch {
        // ignore
      }
    }
  });

  input.addEventListener("mousedown", (ev) => {
    ev.stopPropagation();
  });
  input.addEventListener("wheel", (ev) => {
    ev.stopPropagation();
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      commitAndHideStepInput(state, "commit");
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      commitAndHideStepInput(state, "cancel");
    }
  });

  input.addEventListener("blur", () => {
    commitAndHideStepInput(state, "commit");
  });
}

/**
 * 打开某行的 N 输入框（覆盖在 Canvas 对应矩形上）。
 *
 * @param {TradeUIState} state
 * @param {"player"|"merchant"} side
 * @param {string} itemId
 * @param {{ x:number,y:number,width:number,height:number }} boundsPx  Canvas 像素坐标
 * @param {number} availableCount
 */
function openStepNInput(state, side, itemId, boundsPx, availableCount) {
  const input = state.stepInputEl;
  if (!input) return;

  const rect = state.canvas.getBoundingClientRect();
  const cssScaleX = rect.width > 0 ? rect.width / state.canvas.width : 1;
  const cssScaleY = rect.height > 0 ? rect.height / state.canvas.height : 1;

  const left = rect.left + boundsPx.x * cssScaleX;
  const top = rect.top + boundsPx.y * cssScaleY;
  const width = Math.max(24, boundsPx.width * cssScaleX);
  const height = Math.max(24, boundsPx.height * cssScaleY);

  const current = getStepN(state, side, itemId, availableCount);
  state.stepInputSession = { side, itemId, originalValue: current | 0 };

  input.style.display = "block";
  input.style.left = `${Math.round(left)}px`;
  input.style.top = `${Math.round(top)}px`;
  input.style.width = `${Math.round(width)}px`;
  input.style.height = `${Math.round(height)}px`;

  input.value = String(current | 0);
  input.focus();
  input.select();
}

/**
 * @param {TradeUIState} state
 * @param {"commit"|"cancel"} mode
 */
function commitAndHideStepInput(state, mode) {
  const input = state.stepInputEl;
  const session = state.stepInputSession;
  if (!input || !session) {
    if (input) input.style.display = "none";
    state.stepInputSession = null;
    return;
  }

  const { side, itemId, originalValue } = session;
  const avail = findAvailableCountForSide(state.context, side, itemId);

  if (mode === "cancel") {
    setStepN(state, side, itemId, clamp(originalValue, 0, avail));
  } else {
    // 用户选择的策略：非法/空输入当作 0
    const raw = String(input.value || "").trim();
    const parsed = raw ? parseInt(raw, 10) : 0;
    const next = Number.isFinite(parsed) ? (parsed | 0) : 0;
    setStepN(state, side, itemId, clamp(next, 0, avail));
  }

  input.style.display = "none";
  state.stepInputSession = null;
  requestFullRedraw(state);
}

