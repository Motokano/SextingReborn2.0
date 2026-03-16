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
import { applyRowTradeAction } from "./trade_context.js";

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
 * @property {"mousedown"|"mouseup"|"click"} type
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
 * @property {{ isPointerDown: boolean, lastPointerX: number, lastPointerY: number }} pointerState
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
    pointerState: {
      isPointerDown: false,
      lastPointerX: 0,
      lastPointerY: 0,
    },
  };

  // 初始构建 UI 元素（仅标题栏关闭按钮与成交按钮，列表行由上层绘制层在首次 drawAll 中补充）
  rebuildStaticUIElements(state);

  // 初次计算感受词（通常在没有 pending 的情况下会返回「可以」等中性值）
  recomputeFeelings(state);

  // 立即绘制一帧
  renderer.drawAll(state);
  state.needsRedraw = false;

  // 绑定鼠标事件
  attachCanvasEventListeners(state);

  return state;
}

/**
 * 根据当前布局重建静态 UI 元素，如关闭按钮与成交按钮。
 *
 * @param {TradeUIState} state
 */
function rebuildStaticUIElements(state) {
  const { layout } = state;

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

  state.uiElements = elements;
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
 * 将浏览器鼠标事件转换为 TradePointerEvent / TradeWheelEvent。
 *
 * @param {TradeUIState} state
 * @param {MouseEvent | WheelEvent} ev
 * @param {"mousedown"|"mouseup"|"click"|"wheel"} type
 * @returns {TradePointerEvent | TradeWheelEvent}
 */
function normalizePointerEvent(state, ev, type) {
  const rect = state.canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;

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
    const pev = /** @type {TradePointerEvent} */ (
      normalizePointerEvent(state, ev, "mousedown")
    );
    state.pointerState.isPointerDown = true;
    state.pointerState.lastPointerX = pev.x;
    state.pointerState.lastPointerY = pev.y;
  };

  const handleMouseUp = (ev) => {
    const pev = /** @type {TradePointerEvent} */ (
      normalizePointerEvent(state, ev, "mouseup")
    );
    state.pointerState.isPointerDown = false;
    dispatchPointerEvent(state, pev);

    // 将 mouseup 视为一次 click，方便按钮实现
    const clickEv = /** @type {TradePointerEvent} */ (
      normalizePointerEvent(state, ev, "click")
    );
    dispatchPointerEvent(state, clickEv);
  };

  const handleMouseMove = (ev) => {
    const pev = /** @type {TradePointerEvent} */ (
      normalizePointerEvent(state, ev, "mousemove")
    );
    state.pointerState.lastPointerX = pev.x;
    state.pointerState.lastPointerY = pev.y;
    dispatchPointerEvent(state, pev);
  };

  const handleWheel = (ev) => {
    const wev = /** @type {TradeWheelEvent} */ (
      normalizePointerEvent(state, ev, "wheel")
    );
    dispatchWheelEvent(state, wev);
  };

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("wheel", handleWheel, { passive: true });
}

