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

    // 通用样式
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = "16px sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // 标题栏背景与边框
    drawRect(ctx, bounds.titleBar, "#222222");
    // 标题文字
    const merchantName = context.merchant?.name || "某人";
    const currencies = context.acceptedCurrencies?.join("、") || "未知货币";
    const titleText = `${merchantName} 说能用 ${currencies} 交易。`;
    drawTextLeft(ctx, titleText, bounds.titleText.x + 8, bounds.titleText.y + bounds.titleText.height / 2);

    // 关闭按钮
    drawRect(ctx, bounds.closeButton, "#552222");
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    drawTextCenter(ctx, "X", bounds.closeButton);
    ctx.textAlign = "left";

    // 左右列表区域
    drawRect(ctx, bounds.playerList, "rgba(40, 40, 40, 0.9)");
    drawRect(ctx, bounds.merchantList, "rgba(40, 40, 40, 0.9)");

    // 列表标题
    ctx.fillStyle = "#ffffff";
    drawTextLeft(
      ctx,
      "你的东西",
      bounds.playerList.x + 8,
      bounds.playerList.y + 20
    );
    const rightTitle = `${merchantName} 的东西`;
    drawTextLeft(
      ctx,
      rightTitle,
      bounds.merchantList.x + 8,
      bounds.merchantList.y + 20
    );

    // 底部感受行
    drawRect(ctx, bounds.feelingBar, "#222222");
    ctx.fillStyle = "#ffffff";

    let feelingText = "你觉得 ……，对方觉得 ……。";
    if (lastFeelingResult) {
      const p = lastFeelingResult.playerFeeling;
      const m = lastFeelingResult.merchantFeeling;
      feelingText = `你觉得「${p}」，${merchantName} 觉得「${m}」。`;
    }
    drawTextLeft(
      ctx,
      feelingText,
      bounds.feelingBar.x + 12,
      bounds.feelingBar.y + bounds.feelingBar.height / 2
    );

    // 成交按钮
    drawRect(ctx, bounds.dealButton, "#225522");
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    drawTextCenter(ctx, "成交", bounds.dealButton);
    ctx.textAlign = "left";
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
      console.log("[TradeDemo] close requested");
    },
  };
}

/**
 * 帮助函数：绘制带边框的矩形。
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {string} fillStyle
 */
function drawRect(ctx, rect, fillStyle) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
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

