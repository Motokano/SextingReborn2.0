/**
 * 交易 Canvas 布局与坐标系定义。
 *
 * 对齐规划文档：
 * - canvas-trade-ui-design.plan.md「二、Canvas 布局分区设计」
 *
 * 本文件只负责：
 * - 定义一个逻辑坐标系（虚拟分辨率）
 * - 根据实际 Canvas 像素尺寸，计算各 UI 区域在逻辑坐标中的 bounds
 * - 提供统一的数据结构给绘制层和交互层使用
 *
 * 不包含任何具体绘制或事件绑定逻辑。
 */

/**
 * 逻辑坐标系的宽高（虚拟分辨率，基准分辨率）。
 *
 * 硬约束：1280×720。
 * 所有布局以该坐标系为基准，再按实际 Canvas 尺寸等比缩放，
 * scale = min(viewW/1280, viewH/720)。
 */
export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 720;

/**
 * 一个矩形区域的基础描述。
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * 交易界面主要布局区域的集合。
 *
 * 坐标均基于逻辑坐标系（LOGICAL_WIDTH/LOGICAL_HEIGHT）：
 * - mask: 遮罩层（覆盖全屏）
 * - panel: 居中面板（弹窗主体）
 * - titleBar: 标题栏（包含说明文本与关闭按钮）
 * - titleText: 标题文案区域（左侧）
 * - closeButton: 右侧关闭按钮
 * - tableHeader: 双列表的表头行（“玩家可交易物品 / 对方可交易物品”）
 * - playerList: 左侧玩家物品列表区域（可独立滚动）
 * - merchantList: 右侧商人物品列表区域（可独立滚动）
 * - profitSep: 利润行上方分隔线区域
 * - profitBar: 底部利润行（左侧净利润，右侧成交按钮在同一行）
 * - profitText: 净利润文字区域
 * - dealButton: 右侧成交按钮
 *
 * 行内按钮（-10/-1/N/+1/+10 等）由列表绘制逻辑在各自列表区域内部再细分。
 *
 * @typedef {Object} TradeLayoutBounds
 * @property {Rect} mask
 * @property {Rect} panel
 * @property {Rect} titleBar
 * @property {Rect} titleText
 * @property {Rect} closeButton
 * @property {Rect} tableHeader
 * @property {Rect} playerList
 * @property {Rect} merchantList
 * @property {Rect} profitSep
 * @property {Rect} profitBar
 * @property {Rect} profitText
 * @property {Rect} dealButton
 */

/**
 * 在逻辑坐标系下计算一次标准布局。
 *
 * 说明：
 * - 顶部预留约 10% 高度作为标题栏
 * - 中间约 65% 高度用于双列表：左右各占一半，中间留出少量间隔
 * - 底部约 15% 高度作为感受行与成交按钮区域
 * - 四周保留统一的外边距，避免贴边
 *
 * 返回的所有 bounds 都是基于 LOGICAL_WIDTH/LOGICAL_HEIGHT 的绝对值。
 *
 * @returns {TradeLayoutBounds}
 */
export function computeLogicalTradeLayoutBounds() {
  const mask = { x: 0, y: 0, width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT };

  // 面板尺寸：尽量贴近 1280×720 但保留外边距，营造弹窗感
  const outerMargin = 56;
  const panel = {
    x: outerMargin,
    y: outerMargin,
    width: LOGICAL_WIDTH - outerMargin * 2,
    height: LOGICAL_HEIGHT - outerMargin * 2,
  };

  const pad = 24;
  const titleHeight = 54;
  const headerHeight = 34;
  const profitHeight = 54;
  const sepHeight = 10;

  const contentX = panel.x + pad;
  const contentW = panel.width - pad * 2;

  const titleBar = {
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: titleHeight,
  };

  const closeButtonSize = 34;
  const closeButton = {
    x: titleBar.x + titleBar.width - pad - closeButtonSize,
    y: titleBar.y + Math.floor((titleBar.height - closeButtonSize) / 2),
    width: closeButtonSize,
    height: closeButtonSize,
  };

  const titleText = {
    x: titleBar.x + pad,
    y: titleBar.y,
    width: closeButton.x - (titleBar.x + pad) - 8,
    height: titleBar.height,
  };

  const tableHeader = {
    x: contentX,
    y: titleBar.y + titleBar.height + 10,
    width: contentW,
    height: headerHeight,
  };

  const midGap = 16;
  const listWidth = Math.floor((contentW - midGap) / 2);
  const listTop = tableHeader.y + tableHeader.height + 6;
  const listBottom = panel.y + panel.height - pad - profitHeight - sepHeight;
  const listHeight = Math.max(0, listBottom - listTop);

  const playerList = {
    x: contentX,
    y: listTop,
    width: listWidth,
    height: listHeight,
  };

  const merchantList = {
    x: contentX + listWidth + midGap,
    y: listTop,
    width: listWidth,
    height: listHeight,
  };

  const profitSep = {
    x: contentX,
    y: panel.y + panel.height - pad - profitHeight - sepHeight,
    width: contentW,
    height: sepHeight,
  };

  const profitBar = {
    x: contentX,
    y: panel.y + panel.height - pad - profitHeight,
    width: contentW,
    height: profitHeight,
  };

  const dealButtonWidth = 144;
  const dealButtonHeight = 34;
  const dealButtonRightInset = 14;
  const dealButton = {
    x: profitBar.x + profitBar.width - dealButtonRightInset - dealButtonWidth,
    y: profitBar.y + Math.floor((profitBar.height - dealButtonHeight) / 2),
    width: dealButtonWidth,
    height: dealButtonHeight,
  };

  const profitText = {
    x: profitBar.x,
    y: profitBar.y,
    width: dealButton.x - profitBar.x - 12,
    height: profitBar.height,
  };

  return {
    mask,
    panel,
    titleBar,
    titleText,
    closeButton,
    tableHeader,
    playerList,
    merchantList,
    profitSep,
    profitBar,
    profitText,
    dealButton,
  };
}

/**
 * 将逻辑坐标系下的布局映射到实际 Canvas 像素坐标。
 *
 * - 保持宽高比等比缩放，以 LOGICAL_WIDTH×LOGICAL_HEIGHT 为基准。
 * - 在实际 Canvas 中居中显示，多余部分作为黑边/留白。
 *
 * @param {number} canvasWidth  实际 Canvas 像素宽度
 * @param {number} canvasHeight 实际 Canvas 像素高度
 * @returns {{ scale: number, offsetX: number, offsetY: number, bounds: TradeLayoutBounds }}
 */
export function computePhysicalTradeLayout(canvasWidth, canvasHeight) {
  const logicalBounds = computeLogicalTradeLayoutBounds();

  // 等比缩放
  const scaleX = canvasWidth / LOGICAL_WIDTH;
  const scaleY = canvasHeight / LOGICAL_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  // 居中偏移
  const contentWidth = LOGICAL_WIDTH * scale;
  const contentHeight = LOGICAL_HEIGHT * scale;
  const offsetX = (canvasWidth - contentWidth) / 2;
  const offsetY = (canvasHeight - contentHeight) / 2;

  // 像素对齐：尽量用整数像素，营造像素复古风的“硬边”
  const scaleRect = (r) => {
    const x = offsetX + r.x * scale;
    const y = offsetY + r.y * scale;
    const w = r.width * scale;
    const h = r.height * scale;
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
    };
  };

  return {
    scale,
    offsetX,
    offsetY,
    bounds: {
      mask: scaleRect(logicalBounds.mask),
      panel: scaleRect(logicalBounds.panel),
      titleBar: scaleRect(logicalBounds.titleBar),
      titleText: scaleRect(logicalBounds.titleText),
      closeButton: scaleRect(logicalBounds.closeButton),
      tableHeader: scaleRect(logicalBounds.tableHeader),
      playerList: scaleRect(logicalBounds.playerList),
      merchantList: scaleRect(logicalBounds.merchantList),
      profitSep: scaleRect(logicalBounds.profitSep),
      profitBar: scaleRect(logicalBounds.profitBar),
      profitText: scaleRect(logicalBounds.profitText),
      dealButton: scaleRect(logicalBounds.dealButton),
    },
  };
}

