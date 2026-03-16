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
 * 逻辑坐标系的宽高（虚拟分辨率）。
 * 所有布局以该坐标系为基准，再按实际 Canvas 尺寸等比缩放。
 */
export const LOGICAL_WIDTH = 1920;
export const LOGICAL_HEIGHT = 1080;

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
 * - titleBar: 顶部标题栏（包含说明文本与关闭按钮）
 * - titleText: 标题文案区域（左侧）
 * - closeButton: 右上角关闭按钮
 * - playerList: 左侧玩家物品列表整体区域
 * - merchantList: 右侧商人物品列表整体区域
 * - feelingBar: 底部感受行文案区域
 * - dealButton: 右下角成交按钮
 *
 * 行内按钮（-10/-1/N/+1/+10 等）由列表绘制逻辑在各自列表区域内部再细分。
 *
 * @typedef {Object} TradeLayoutBounds
 * @property {Rect} titleBar
 * @property {Rect} titleText
 * @property {Rect} closeButton
 * @property {Rect} playerList
 * @property {Rect} merchantList
 * @property {Rect} feelingBar
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
  // 统一边距
  const marginX = 80;
  const marginTop = 60;
  const marginBottom = 80;

  // 垂直分配
  const titleHeight = 100; // 顶部标题栏高度
  const bottomHeight = 160; // 底部感受区高度
  const centerTop = marginTop + titleHeight;
  const centerBottom = LOGICAL_HEIGHT - marginBottom - bottomHeight;
  const centerHeight = Math.max(0, centerBottom - centerTop);

  // 水平分配：左右列表
  const contentWidth = LOGICAL_WIDTH - marginX * 2;
  const midGap = 40; // 左右列表之间的空隙
  const listWidth = (contentWidth - midGap) / 2;

  const titleBar = {
    x: marginX,
    y: marginTop,
    width: contentWidth,
    height: titleHeight,
  };

  // 标题文字区域占标题栏左侧大部分空间
  const titleText = {
    x: titleBar.x + 20,
    y: titleBar.y,
    width: titleBar.width - 200, // 预留右侧关闭按钮空间
    height: titleBar.height,
  };

  // 关闭按钮位于右上角，保留内边距
  const closeButtonSize = 64;
  const closeButton = {
    x: titleBar.x + titleBar.width - closeButtonSize,
    y: titleBar.y + (titleBar.height - closeButtonSize) / 2,
    width: closeButtonSize,
    height: closeButtonSize,
  };

  const playerList = {
    x: marginX,
    y: centerTop,
    width: listWidth,
    height: centerHeight,
  };

  const merchantList = {
    x: marginX + listWidth + midGap,
    y: centerTop,
    width: listWidth,
    height: centerHeight,
  };

  const feelingBar = {
    x: marginX,
    y: LOGICAL_HEIGHT - marginBottom - bottomHeight,
    width: contentWidth - 260, // 右侧预留给成交按钮
    height: bottomHeight,
  };

  const dealButtonWidth = 220;
  const dealButtonHeight = 96;
  const dealButton = {
    x: marginX + contentWidth - dealButtonWidth,
    y: feelingBar.y + (feelingBar.height - dealButtonHeight) / 2,
    width: dealButtonWidth,
    height: dealButtonHeight,
  };

  return {
    titleBar,
    titleText,
    closeButton,
    playerList,
    merchantList,
    feelingBar,
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

  const scaleRect = (r) => ({
    x: offsetX + r.x * scale,
    y: offsetY + r.y * scale,
    width: r.width * scale,
    height: r.height * scale,
  });

  return {
    scale,
    offsetX,
    offsetY,
    bounds: {
      titleBar: scaleRect(logicalBounds.titleBar),
      titleText: scaleRect(logicalBounds.titleText),
      closeButton: scaleRect(logicalBounds.closeButton),
      playerList: scaleRect(logicalBounds.playerList),
      merchantList: scaleRect(logicalBounds.merchantList),
      feelingBar: scaleRect(logicalBounds.feelingBar),
      dealButton: scaleRect(logicalBounds.dealButton),
    },
  };
}

