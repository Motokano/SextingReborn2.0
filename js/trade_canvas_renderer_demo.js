/**
 * 交易 Canvas UI 的最小 demo 渲染器。
 *
 * 目标：
 * - 基于 trade_layout.js 产生的 layout.bounds，在 Canvas 上画出基础框架
 * - 展示标题栏、左右列表区域、底部感受行、成交按钮与关闭按钮
 * - 使用 state.lastFeelingResult 渲染感受词文案
 *
 * 本文件仅用于 demo，不追求美术效果。
 */

import { confirmCurrentTrade } from "./trade_canvas_ui.js";
import { LIST_INSET_Y, LIST_TEXT_PAD_X, ROW_HEIGHT } from "./trade_canvas_ui.js";

const THEME = {
  mask: "rgba(0,0,0,0.72)",
  panelFill: "rgba(28, 22, 18, 0.92)", // #1c1612 with alpha
  panelStroke: "#4d3f35",
  panelStrokeHot: "#fbbf24",
  panelStrokeStrong: "#d4a373",
  titleFill: "rgba(45, 36, 30, 0.96)", // #2d241e with alpha
  listFill: "rgba(0,0,0,0.28)",
  listStroke: "#4d3f35",
  sep: "#3d2d24",
  text: "#e8e6e3",
  muted: "#a8a29e",
  btnFill: "#3d332c",
  btnFillHot: "#4d3f35",
  btnFillPressed: "#2d241e",
  btnStroke: "#57534e",
  btnStrokeHot: "#fbbf24",
  btnDanger: "#6a2b2b",
  btnOk: "#2b6a3a",
};

const FONT = {
  ui: '18px "Microsoft YaHei", "微软雅黑", "PingFang SC", system-ui, sans-serif',
  uiBold: '18px "Microsoft YaHei", "微软雅黑", "PingFang SC", system-ui, sans-serif',
  title: '21px "Microsoft YaHei", "微软雅黑", "PingFang SC", system-ui, sans-serif',
};

/**
 * 创建一个简单的 demo 渲染器，实现 TradeUIRenderer 接口。
 *
 * @returns {import("./trade_canvas_ui.js").TradeUIRenderer}
 */
export function createDemoRenderer() {
  /**
   * @param {import("./trade_canvas_ui.js").TradeUIState} state
   */
  function drawAll(state) {
    const { ctx, canvas, layout, context, lastFeelingResult } = state;
    const { bounds } = layout;

    // 清屏
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.imageSmoothingEnabled = false;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.lineWidth = 1;

    // 遮罩
    ctx.fillStyle = THEME.mask;
    ctx.fillRect(bounds.mask.x, bounds.mask.y, bounds.mask.width, bounds.mask.height);

    // 面板
    drawPanel(ctx, bounds.panel);

    // 标题栏（同一行：文案 + 右侧关闭）
    drawRoundedRect(ctx, bounds.titleBar, 8, THEME.titleFill, THEME.panelStroke);
    ctx.font = FONT.title;
    ctx.fillStyle = THEME.text;
    const merchantName = context.merchant?.name || "某人";
    const currencies = context.acceptedCurrencies?.join("、") || "未知货币";
    const titleText = `「${merchantName} 说能用 ${currencies} 交易。」`;
    drawTextLeft(ctx, titleText, bounds.titleText.x + 6, bounds.titleText.y + bounds.titleText.height / 2);

    // 关闭按钮
    drawUIButton(ctx, state, "closeButton", bounds.closeButton, {
      baseFill: THEME.btnDanger,
      baseStroke: THEME.btnStroke,
    });
    ctx.font = FONT.uiBold;
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    drawTextCenter(ctx, "X", bounds.closeButton);
    ctx.textAlign = "left";

    // 表头
    ctx.font = FONT.uiBold;
    ctx.fillStyle = THEME.text;
    const midX = bounds.tableHeader.x + bounds.tableHeader.width / 2;
    drawTextLeft(ctx, "玩家可交易物品", bounds.tableHeader.x + 4, bounds.tableHeader.y + bounds.tableHeader.height / 2);
    drawTextLeft(ctx, "对方可交易物品", midX + 8, bounds.tableHeader.y + bounds.tableHeader.height / 2);

    // 双列表（独立裁剪 + 滚动）
    drawList(ctx, state, "player");
    drawList(ctx, state, "merchant");

    // 分隔线
    ctx.strokeStyle = THEME.sep;
    ctx.beginPath();
    ctx.moveTo(bounds.profitSep.x, bounds.profitSep.y + Math.floor(bounds.profitSep.height / 2));
    ctx.lineTo(bounds.profitSep.x + bounds.profitSep.width, bounds.profitSep.y + Math.floor(bounds.profitSep.height / 2));
    ctx.stroke();

    // 利润行 + 成交按钮
    drawRoundedRect(ctx, bounds.profitBar, 8, THEME.titleFill, THEME.panelStroke);
    const currencyName = context.acceptedCurrencies?.[0] || "货币";
    const netProfit = computeNetProfitValue(lastFeelingResult);
    ctx.font = FONT.uiBold;
    ctx.fillStyle = THEME.text;
    drawTextLeft(
      ctx,
      `${netProfit} ${currencyName}`,
      bounds.profitText.x + 6,
      bounds.profitText.y + bounds.profitText.height / 2
    );

    drawUIButton(ctx, state, "dealButton", bounds.dealButton, {
      baseFill: THEME.btnOk,
      baseStroke: THEME.btnStroke,
      disabled: isDealButtonDisabled(state),
    });
    ctx.fillStyle = THEME.text;
    ctx.textAlign = "center";
    drawTextCenter(ctx, "成交", bounds.dealButton);
    ctx.textAlign = "left";

    // 最后绘制所有按钮的文字（从命中框读取，保证与点击区域一致）
    drawUIButtonLabels(ctx, state);
  }

  /**
   * 显示确认对话框：若用户确认，则调用 confirmCurrentTrade。
   */
  function showCommitConfirmDialog() {
    const ok = window.confirm("资金池可能不足，仍要贩卖并将超出部分换算为商誉吗？");
    // 这里无法直接访问 state，因此该函数会在绑定时被包装
    // 实际实现见 createDemoRendererWithState 包装。
  }

  // 由于 TradeUIRenderer 接口没有内置 state，我们在 demo 中会对返回对象做一次包装，
  // 将 showCommitConfirmDialog / onCloseRequested / showTransientMessage 在初始化时
  // 重写为可访问具体 state 的闭包。这里先返回一个占位对象，具体绑定在 initDemo 中完成。

  return {
    drawAll,
    showCommitConfirmDialog,
    showTransientMessage(message) {
      // 简易提示：控制台 + alert
      console.warn("[TradeDemo]", message);
      window.alert(message);
    },
    onCloseRequested() {
      // demo：关闭即重置会话（满足“关闭时删除隐藏行/清空 pending”）
      window.location.reload();
    },
  };
}

/**
 * 计算净利润整数值（可正负0）。
 * demo：直接用 playerDelta（内部价值差）作为整数展示。
 *
 * @param {import("./trade_context.js").PerceivedFeelingResult|null} lastFeelingResult
 */
function computeNetProfitValue(lastFeelingResult) {
  if (!lastFeelingResult || !lastFeelingResult.valueSummary) return 0;
  const s = lastFeelingResult.valueSummary;
  const delta = (s.V_player_get || 0) - (s.V_player_give || 0);
  // 只展示整数
  return (delta | 0);
}

function drawPanel(ctx, rect) {
  ctx.save();
  drawRoundedRect(ctx, rect, 10, THEME.panelFill, THEME.panelStrokeStrong);
  ctx.restore();
}

/**
 * 帮助函数：绘制带边框的矩形。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {string} fillStyle
 * @param {string} [strokeStyle]
 */
function drawRect(ctx, rect, fillStyle, strokeStyle) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = strokeStyle || THEME.panelStroke;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

/**
 * 圆角矩形（用于面板/按钮更贴近 test-scene）。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {number} radius
 * @param {string} fillStyle
 * @param {string} strokeStyle
 */
function drawRoundedRect(ctx, rect, radius, fillStyle, strokeStyle) {
  const r = Math.max(0, Math.min(radius, Math.floor(Math.min(rect.width, rect.height) / 2)));
  const x = rect.x, y = rect.y, w = rect.width, h = rect.height;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();
  ctx.restore();
}

/**
 * 统一按钮绘制（支持 hover/pressed/disabled）。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("./trade_canvas_ui.js").TradeUIState} state
 * @param {string} elementId
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {{ baseFill: string, baseStroke: string, disabled?: boolean }} opt
 */
function drawUIButton(ctx, state, elementId, rect, opt) {
  const isHover = (state.hoverElementId || null) === elementId;
  const isPressed = (state.pressedElementId || null) === elementId;
  const disabled = !!opt.disabled;

  const fill = disabled
    ? opt.baseFill
    : isPressed
      ? THEME.btnFillPressed
      : isHover
        ? THEME.btnFillHot
        : opt.baseFill;

  const stroke = disabled
    ? opt.baseStroke
    : isHover
      ? THEME.btnStrokeHot
      : opt.baseStroke;

  ctx.save();
  if (disabled) ctx.globalAlpha = 0.45;
  const inset = isPressed && !disabled ? 1 : 0;
  drawRoundedRect(
    ctx,
    { x: rect.x + inset, y: rect.y + inset, width: rect.width, height: rect.height },
    6,
    fill,
    stroke
  );
  ctx.restore();
}

/**
 * 在给定矩形中心绘制居中文本。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {{ x: number, y: number, width: number, height: number }} rect
 */
function drawTextCenter(ctx, text, rect) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  ctx.fillText(text, cx, cy);
}

/**
 * 绘制左对齐文本。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 */
function drawTextLeft(ctx, text, x, y) {
  ctx.fillText(text, x, y);
}

function buildRowsForSide(context, side) {
  const inv = side === "player" ? context.playerInventory : context.merchantInventory;
  const pending =
    side === "player" ? context.pendingGetPlayer : context.pendingGivePlayer;

  /** @type {Object.<string, { itemId: string, displayName: string, availableCount: number, pendingCount: number, underline: boolean }>} */
  const map = {};

  for (const row of inv) {
    if (!row || !row.item) continue;
    map[row.item.itemId] = {
      itemId: row.item.itemId,
      displayName: row.item.displayName,
      availableCount: row.availableCount | 0,
      pendingCount: 0,
      underline: false,
    };
  }

  for (const itemId in pending) {
    const p = pending[itemId];
    const cnt = (p?.count || 0) | 0;
    if (cnt <= 0) continue;
    if (!map[itemId]) {
      map[itemId] = {
        itemId,
        displayName: itemId,
        availableCount: 0,
        pendingCount: cnt,
        underline: true,
      };
    } else {
      map[itemId].pendingCount = cnt;
      map[itemId].underline = true;
    }
  }

  const rows = Object.values(map);
  rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-Hans-CN"));
  return rows;
}

function drawList(ctx, state, side) {
  const { bounds } = state.layout;
  const listRect = side === "player" ? bounds.playerList : bounds.merchantList;

  // 背景
  drawRoundedRect(ctx, listRect, 8, THEME.listFill, THEME.listStroke);

  const rows = buildRowsForSide(state.context, side);
  const otherRows = buildRowsForSide(state.context, side === "player" ? "merchant" : "player");
  const totalRows = Math.max(rows.length, otherRows.length);

  if (totalRows === 0) {
    ctx.save();
    ctx.font = FONT.ui;
    ctx.fillStyle = THEME.muted;
    ctx.textAlign = "center";
    ctx.fillText("空", listRect.x + listRect.width / 2, listRect.y + listRect.height / 2);
    ctx.textAlign = "left";
    ctx.restore();
    return;
  }

  // 本侧为空态：即使对侧有数据，也在本侧列表中央显示“空”
  if (rows.length === 0) {
    ctx.save();
    ctx.font = FONT.ui;
    ctx.fillStyle = THEME.muted;
    ctx.textAlign = "center";
    ctx.fillText("空", listRect.x + listRect.width / 2, listRect.y + listRect.height / 2);
    ctx.textAlign = "left";
    ctx.restore();
    return;
  }

  const ROW_H = ROW_HEIGHT;
  const scrollY = (state.scrollY && state.scrollY[side]) || 0;
  const viewportH = Math.max(0, listRect.height - LIST_INSET_Y * 2);
  const visibleStart = Math.max(0, Math.floor(scrollY / ROW_H));
  const visibleEnd = Math.min(totalRows, visibleStart + Math.ceil(viewportH / ROW_H) + 2);

  // 裁剪
  ctx.save();
  ctx.beginPath();
  ctx.rect(listRect.x + 1, listRect.y + 1, listRect.width - 2, listRect.height - 2);
  ctx.clip();

  ctx.font = FONT.ui;
  ctx.fillStyle = THEME.text;

  const contentTop = listRect.y + LIST_INSET_Y;
  for (let i = visibleStart; i < visibleEnd; i += 1) {
    const row = rows[i] || null; // 少的一侧补空行
    const y = contentTop + i * ROW_H - scrollY;
    if (!row) continue;

    const count = row.pendingCount > 0 ? row.pendingCount : row.availableCount;
    const label = `${row.displayName} × ${count}`;

    const textX = listRect.x + LIST_TEXT_PAD_X;
    const textY = y + ROW_H / 2;

    // 下划线（待处理行）
    if (row.underline) {
      const w = ctx.measureText(row.displayName).width;
      ctx.save();
      ctx.strokeStyle = THEME.text;
      ctx.beginPath();
      ctx.moveTo(textX, textY + 8);
      ctx.lineTo(textX + w, textY + 8);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillText(label, textX, textY);
  }

  ctx.restore();
}

function drawUIButtonLabels(ctx, state) {
  const { uiElements } = state;
  if (!uiElements || uiElements.length === 0) return;

  ctx.save();
  ctx.font = FONT.ui;
  ctx.fillStyle = THEME.text;
  ctx.textAlign = "center";

  for (const el of uiElements) {
    const id = el.id || "";
    const b = el.bounds;

    if (id === "dealButton") continue;
    if (id === "closeButton") continue;
    if (id.endsWith("ListScroll")) continue;

    // step 按钮
    // id: "<side>:step:<delta|N>:<itemId>"
    if (id.includes(":step:")) {
      const parts = id.split(":");
      const side = parts[0];
      const delta = parts[2];
      const itemId = parts.slice(3).join(":");
      let text = delta;
      if (delta === "N") {
        const n = (state.stepN && state.stepN[side] && state.stepN[side][itemId]) || 1;
        text = String(n | 0);
      }
      drawUIButton(ctx, state, id, b, {
        baseFill: THEME.btnFill,
        baseStroke: THEME.btnStroke,
        disabled: isElementDisabled(state, id),
      });
      ctx.fillText(text, b.x + b.width / 2, b.y + b.height / 2);
      continue;
    }

    // action 按钮
    // id: "<side>:action:<kind>:<itemId>"
    if (id.includes(":action:")) {
      const parts = id.split(":");
      const side = parts[0];
      const kind = parts[2];
      const itemId = parts.slice(3).join(":");
      const n =
        (state.stepN && state.stepN[side] && state.stepN[side][itemId]) || 1;
      const nText = String(n | 0);

      let text = "";
      if (side === "player") {
        if (kind === "giveN") text = `给${nText}个`;
        else if (kind === "giveAll") text = "全都给";
      } else {
        if (kind === "getN") text = `要${nText}个`;
        else if (kind === "getAll") text = "全都要";
      }

      drawUIButton(ctx, state, id, b, {
        baseFill: THEME.btnFill,
        baseStroke: THEME.btnStroke,
        disabled: isElementDisabled(state, id),
      });
      ctx.fillText(text, b.x + b.width / 2, b.y + b.height / 2);
      continue;
    }
  }

  ctx.restore();
}

/**
 * 视觉 disabled：按钮仍可点击（不强制禁用逻辑），但当数量为 0 / 无可用库存时降 opacity。
 *
 * @param {import("./trade_canvas_ui.js").TradeUIState} state
 * @param {string} elementId
 */
function isElementDisabled(state, elementId) {
  if (!elementId) return false;

  // step: "<side>:step:<delta|N>:<itemId>"
  if (elementId.includes(":step:")) {
    const parts = elementId.split(":");
    const side = parts[0];
    const itemId = parts.slice(3).join(":");
    const avail = findAvailableCount(state.context, side, itemId);
    return avail <= 0;
  }

  // action: "<side>:action:<kind>:<itemId>"
  if (elementId.includes(":action:")) {
    const parts = elementId.split(":");
    const side = parts[0];
    const kind = parts[2];
    const itemId = parts.slice(3).join(":");

    const invSide = side === "player" ? "player" : "merchant";
    const avail = findAvailableCount(state.context, invSide, itemId);
    if (avail <= 0) return true;

    if (kind === "giveN" || kind === "getN") {
      const n =
        (state.stepN && state.stepN[side] && state.stepN[side][itemId]) || 1;
      return (n | 0) <= 0;
    }
    return false;
  }

  if (elementId === "dealButton") return isDealButtonDisabled(state);
  return false;
}

/**
 * @param {import("./trade_context.js").TradeContext} context
 * @param {"player"|"merchant"} side
 * @param {string} itemId
 */
function findAvailableCount(context, side, itemId) {
  const inv = side === "player" ? context.playerInventory : context.merchantInventory;
  for (const row of inv) {
    if (row?.item?.itemId === itemId) return Math.max(0, row.availableCount | 0);
  }
  return 0;
}

/**
 * 成交按钮：当四个 pending 都为空时，显示 disabled（视觉）。
 *
 * @param {import("./trade_canvas_ui.js").TradeUIState} state
 */
function isDealButtonDisabled(state) {
  const c = state.context;
  const hasAny = (obj) => {
    if (!obj) return false;
    for (const k in obj) {
      const v = obj[k];
      if ((v?.count || 0) | 0) return true;
    }
    return false;
  };
  return !(
    hasAny(c.pendingGivePlayer) ||
    hasAny(c.pendingGetPlayer) ||
    hasAny(c.pendingGiveMerchant) ||
    hasAny(c.pendingGetMerchant)
  );
}

/**
 * 为 demo 提供一个根据具体 state 绑定确认对话逻辑的 renderer。
 *
 * 用法：
 *   const baseRenderer = createDemoRenderer();
 *   const renderer = bindDemoRendererWithState(baseRenderer, () => state);
 *
 * 这样 renderer.showCommitConfirmDialog 内部可以拿到当前 state，并调用 confirmCurrentTrade。
 *
 * @param {ReturnType<typeof createDemoRenderer>} baseRenderer
 * @param {() => import("./trade_canvas_ui.js").TradeUIState} getState
 * @returns {import("./trade_canvas_ui.js").TradeUIRenderer}
 */
export function bindDemoRendererWithState(baseRenderer, getState) {
  return {
    drawAll: (state) => baseRenderer.drawAll(state),
    showTransientMessage: baseRenderer.showTransientMessage,
    onCloseRequested: baseRenderer.onCloseRequested,
    showCommitConfirmDialog: () => {
      const ok = window.confirm("资金池可能不足，仍要贩卖并将超出部分换算为商誉吗？");
      if (ok) {
        const state = getState();
        confirmCurrentTrade(state);
      }
    },
  };
}

